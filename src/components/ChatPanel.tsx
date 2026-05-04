"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import clsx from "clsx";

export interface ChatMessage {
  id: string;
  playerId: string;
  playerName: string;
  text: string;
  createdAt: number;
}

export interface FloatingReaction {
  id: string;
  emoji: string;
  side: "mine" | "theirs";
}

interface ChatPanelProps {
  messages: ChatMessage[];
  myPlayerId: string;
  myName: string;
  opponentName: string;
  reactions: FloatingReaction[];
  disabled?: boolean;
  placeholder?: string;
  onSend: (text: string) => void;
}

const QUICK_MESSAGES = [
  { label: "Good luck! 🤝", text: "Good luck! 🤝" },
  { label: "Nice shot! 💥", text: "Nice shot! 💥" },
  { label: "GG! 🏆", text: "GG! 🏆" },
];

export function ChatPanel({
  messages,
  myPlayerId,
  myName,
  opponentName,
  reactions,
  disabled,
  placeholder,
  onSend,
}: ChatPanelProps) {
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const submit = () => {
    const text = draft.trim();
    if (!text || disabled) return;
    onSend(text);
    setDraft("");
  };

  return (
    <div className="glass neon-border rounded-2xl flex flex-col overflow-hidden h-full min-h-[460px]">
      <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.3em] text-fg-dim">
            Comms
          </div>
          <div className="font-semibold truncate">vs {opponentName || "Opponent"}</div>
        </div>
        <div className="text-[10px] text-fg-dim text-right truncate max-w-[40%]">
          {myName}
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-2 relative"
      >
        {messages.length === 0 && (
          <div className="text-xs text-fg-dim text-center py-6">
            Open a comms channel — say hi!
          </div>
        )}
        {messages.map((m) => {
          const mine = m.playerId === myPlayerId;
          return (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className={clsx(
                "max-w-[85%] rounded-2xl px-3 py-2 text-sm break-words",
                mine
                  ? "ml-auto bg-accent/20 border border-accent/40 text-fg"
                  : "mr-auto bg-white/5 border border-white/10"
              )}
            >
              {!mine && (
                <div className="text-[10px] uppercase tracking-[0.2em] text-fg-dim mb-0.5">
                  {m.playerName}
                </div>
              )}
              <div>{m.text}</div>
            </motion.div>
          );
        })}

        <AnimatePresence>
          {reactions.map((r) => (
            <motion.div
              key={r.id}
              initial={{ opacity: 0, y: 18, scale: 0.6 }}
              animate={{ opacity: 1, y: -70, scale: 1.4 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.6, ease: "easeOut" }}
              className={clsx(
                "pointer-events-none absolute bottom-3 text-3xl select-none",
                r.side === "mine" ? "right-6" : "left-6"
              )}
            >
              {r.emoji}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <div className="px-3 pt-2 pb-3 border-t border-white/10">
        <div className="flex flex-wrap gap-1.5 mb-2">
          {QUICK_MESSAGES.map((q) => (
            <button
              key={q.label}
              disabled={disabled}
              onClick={() => onSend(q.text)}
              className="text-[11px] rounded-full px-3 py-1 border border-white/15 hover:border-accent/60 hover:bg-accent/10 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {q.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
            disabled={disabled}
            maxLength={200}
            placeholder={placeholder ?? (disabled ? "Comms closed" : "Message…")}
            className="flex-1 rounded-lg bg-black/30 border border-white/15 px-3 py-2 text-sm focus:outline-none focus:border-accent/60 disabled:opacity-50"
          />
          <button
            onClick={submit}
            disabled={disabled || !draft.trim()}
            className="neon-btn rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
