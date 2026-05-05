"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { formatCountdown, msUntilNextReset } from "@/lib/tournament";

export function TournamentBanner() {
  const [ms, setMs] = useState<number>(() => msUntilNextReset());

  useEffect(() => {
    const id = setInterval(() => setMs(msUntilNextReset()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass neon-border rounded-2xl sm:rounded-3xl p-3 sm:p-5 flex flex-wrap items-center gap-3 sm:gap-4 relative overflow-hidden"
    >
      <motion.div
        aria-hidden
        className="absolute -top-12 -right-10 w-48 h-48 rounded-full pointer-events-none"
        style={{
          background:
            "radial-gradient(circle, color-mix(in oklab, #fbbf24 55%, transparent), transparent 70%)",
        }}
        animate={{ scale: [1, 1.15, 1] }}
        transition={{ duration: 5, repeat: Infinity }}
      />
      <div className="relative z-10 flex-1 min-w-0 sm:min-w-[220px]">
        <div className="text-[10px] uppercase tracking-[0.4em] text-fg-dim">
          Weekly Tournament
        </div>
        <div className="text-sm sm:text-lg font-bold leading-snug break-words">
          🏆 Top 3 this week win real prizes from the creator
        </div>
      </div>
      <div className="relative z-10 rounded-xl sm:rounded-2xl px-3 sm:px-4 py-1.5 sm:py-2 border border-amber-300/40 bg-amber-300/10">
        <div className="text-[10px] uppercase tracking-[0.3em] text-fg-dim">
          Resets Monday 00:00 UTC
        </div>
        <div
          suppressHydrationWarning
          className="font-mono font-extrabold text-base sm:text-xl tabular-nums"
          style={{
            color: "#fbbf24",
            textShadow: "0 0 12px #fbbf24",
          }}
        >
          {formatCountdown(ms)}
        </div>
      </div>
    </motion.div>
  );
}
