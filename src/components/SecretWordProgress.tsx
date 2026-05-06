"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { LocalProfile, PROFILE_CHANGE_EVENT, loadProfile } from "@/lib/storage";
import {
  SECRET_WORDS,
  TOTAL_SECRET_WORDS,
  decodedWordsCount,
} from "@/lib/powers";

export function SecretWordProgress() {
  const [profile, setProfile] = useState<LocalProfile | null>(null);

  useEffect(() => {
    const refresh = () => setProfile(loadProfile());
    refresh();
    window.addEventListener(PROFILE_CHANGE_EVENT, refresh);
    return () => window.removeEventListener(PROFILE_CHANGE_EVENT, refresh);
  }, []);

  if (!profile) {
    return (
      <div className="glass rounded-2xl p-4">
        <div className="text-[11px] uppercase tracking-[0.3em] text-fg-dim">
          🔤 Words
        </div>
        <div className="text-xs text-fg-dim mt-2">Loading…</div>
      </div>
    );
  }

  const decoded = decodedWordsCount(profile);
  const allFound = decoded >= TOTAL_SECRET_WORDS;
  const pct = Math.round((decoded / TOTAL_SECRET_WORDS) * 100);
  const decodedSet = new Set(profile.decodedWords ?? []);

  return (
    <div className="glass rounded-2xl p-4 relative overflow-hidden">
      <motion.div
        aria-hidden
        className="absolute -top-12 -right-12 w-32 h-32 rounded-full pointer-events-none"
        style={{
          background:
            "radial-gradient(circle, color-mix(in oklab, #14b8a6 35%, transparent), transparent 70%)",
        }}
        animate={{ scale: [1, 1.15, 1] }}
        transition={{ duration: 8, repeat: Infinity }}
      />
      <div className="relative z-10">
        <div className="flex items-baseline justify-between gap-2 flex-wrap">
          <div className="text-[11px] uppercase tracking-[0.3em] text-fg-dim">
            🔤 Words
          </div>
          <div
            className="text-xs font-bold tabular-nums"
            style={{ color: "#5eead4", textShadow: "0 0 8px #14b8a6" }}
          >
            {decoded}/{TOTAL_SECRET_WORDS} decoded
          </div>
        </div>
        <div className="mt-2 h-2 rounded-full bg-white/10 overflow-hidden">
          <motion.div
            className="h-full"
            style={{
              background:
                "linear-gradient(90deg, #14b8a6, #5eead4, #00f0ff)",
              boxShadow: "0 0 10px #14b8a6",
            }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          />
        </div>
        <div className="mt-3 grid grid-cols-5 gap-1.5">
          {SECRET_WORDS.map((w) => {
            const found = decodedSet.has(w);
            return (
              <span
                key={w}
                className={
                  "rounded-md px-1.5 py-1 text-[9px] sm:text-[10px] font-mono font-bold tracking-wider text-center border " +
                  (found
                    ? "border-teal-300/60 bg-teal-300/10"
                    : "border-white/10 bg-black/30 text-fg-dim")
                }
                style={
                  found
                    ? { color: "#5eead4", textShadow: "0 0 8px #14b8a6" }
                    : undefined
                }
                title={found ? `${w} — decoded` : `${w} — not yet decoded`}
              >
                {found ? w : "•••"}
              </span>
            );
          })}
        </div>
        {allFound ? (
          <Link
            href="/workshop"
            className="mt-3 block rounded-xl border border-amber-300/50 bg-amber-300/10 px-3 py-2 text-center text-xs font-bold pulse-glow"
            style={{ color: "#fbbf24", textShadow: "0 0 10px #fbbf24" }}
          >
            🎉 All words found! Open Custom Ship Workshop →
          </Link>
        ) : (
          <div className="mt-3 text-[11px] text-fg-dim leading-relaxed">
            Decode all {TOTAL_SECRET_WORDS} unique words to unlock the{" "}
            <Link
              href="/workshop"
              className="font-bold underline decoration-dotted underline-offset-2"
              style={{ color: "#5eead4" }}
            >
              Custom Ship Workshop
            </Link>
            .
          </div>
        )}
      </div>
    </div>
  );
}
