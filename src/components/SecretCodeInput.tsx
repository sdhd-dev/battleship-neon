"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import clsx from "clsx";
import { useAuth } from "./AuthProvider";
import {
  SECRET_WORDS,
  TOTAL_SECRET_WORDS,
  decodedWordsCount,
  redeemSecretWord,
} from "@/lib/powers";
import { notify } from "@/lib/notify";

type Feedback =
  | { kind: "ok"; word: string }
  | { kind: "dup"; word: string }
  | { kind: "bad" }
  | null;

export function SecretCodeInput() {
  const { profile } = useAuth();
  const [code, setCode] = useState("");
  const [feedback, setFeedback] = useState<Feedback>(null);

  const decoded = decodedWordsCount(profile);
  const decodedSet = new Set(profile.decodedWords ?? []);
  const pct = Math.round((decoded / TOTAL_SECRET_WORDS) * 100);
  const allFound = decoded >= TOTAL_SECRET_WORDS;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = code.trim();
    if (!trimmed) return;
    const result = redeemSecretWord(trimmed);
    if (!result.ok) {
      setFeedback({ kind: "bad" });
      return;
    }
    if (result.alreadyHad) {
      setFeedback({ kind: "dup", word: result.word });
    } else {
      setFeedback({ kind: "ok", word: result.word });
      if (result.profile.customShipUnlocked && !profile.customShipUnlocked) {
        notify("⚓ Workshop unlocked!", "success");
      }
    }
    setCode("");
  };

  return (
    <section className="glass neon-border rounded-3xl p-4 sm:p-5 grid gap-4 text-left">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[10px] uppercase tracking-[0.4em] text-fg-dim">
            Secret codes
          </div>
          <h3 className="text-lg sm:text-xl font-extrabold neon-text mt-1">
            Type the {TOTAL_SECRET_WORDS} words to unlock
          </h3>
        </div>
        <div
          className="text-xs sm:text-sm font-bold tabular-nums whitespace-nowrap"
          style={{ color: "#5eead4", textShadow: "0 0 8px #14b8a6" }}
        >
          {decoded}/{TOTAL_SECRET_WORDS}
        </div>
      </div>

      <div className="h-2 rounded-full bg-white/10 overflow-hidden">
        <motion.div
          className="h-full"
          style={{
            background: "linear-gradient(90deg, #14b8a6, #5eead4, #00f0ff)",
            boxShadow: "0 0 10px #14b8a6",
          }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
      </div>

      <form onSubmit={submit} className="flex gap-2 flex-wrap sm:flex-nowrap">
        <input
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase().slice(0, 12));
            if (feedback) setFeedback(null);
          }}
          placeholder="ENTER A WORD"
          maxLength={12}
          disabled={allFound}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          className={clsx(
            "flex-1 min-w-0 rounded-xl bg-black/40 border border-white/15 px-3 py-3 text-sm font-mono tracking-[0.25em] uppercase min-h-[44px]",
            allFound && "opacity-60"
          )}
        />
        <button
          type="submit"
          disabled={allFound || !code.trim()}
          className={clsx(
            "rounded-xl px-4 py-3 text-sm font-bold whitespace-nowrap min-h-[44px] sm:min-w-[110px]",
            allFound || !code.trim()
              ? "border border-white/15 text-fg-dim cursor-not-allowed"
              : "neon-btn"
          )}
        >
          {allFound ? "Unlocked" : "Submit"}
        </button>
      </form>

      <AnimatePresence mode="wait">
        {feedback && (
          <motion.div
            key={`${feedback.kind}-${"word" in feedback ? feedback.word : ""}`}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className={clsx(
              "rounded-xl px-3 py-2 text-sm font-semibold border",
              feedback.kind === "ok"
                ? "border-teal-300/55 bg-teal-300/10"
                : feedback.kind === "dup"
                  ? "border-white/15 bg-white/5 text-fg-dim"
                  : "border-rose-400/55 bg-rose-400/10"
            )}
            style={
              feedback.kind === "ok"
                ? { color: "#5eead4", textShadow: "0 0 8px #14b8a6" }
                : feedback.kind === "bad"
                  ? { color: "#fb7185", textShadow: "0 0 8px #ff4d6d" }
                  : undefined
            }
          >
            {feedback.kind === "ok" && (
              <>✅ Decoded <span className="font-mono">{feedback.word}</span>!</>
            )}
            {feedback.kind === "dup" && (
              <>You already have <span className="font-mono">{feedback.word}</span>.</>
            )}
            {feedback.kind === "bad" && <>❌ Not a valid word.</>}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 sm:gap-2">
        {SECRET_WORDS.map((w) => {
          const found = decodedSet.has(w);
          return (
            <span
              key={w}
              className={clsx(
                "rounded-lg px-2 py-2 text-[11px] sm:text-xs font-mono font-bold tracking-wider text-center border min-h-[34px] grid place-items-center",
                found
                  ? "border-teal-300/60 bg-teal-300/10"
                  : "border-white/10 bg-black/30 text-fg-dim"
              )}
              style={
                found
                  ? { color: "#5eead4", textShadow: "0 0 8px #14b8a6" }
                  : undefined
              }
              title={found ? `${w} — decoded` : "Not yet decoded"}
            >
              {found ? w : "•••"}
            </span>
          );
        })}
      </div>
    </section>
  );
}
