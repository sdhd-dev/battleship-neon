"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

const TIPS: Array<{ emoji: string; title: string; body: string }> = [
  {
    emoji: "🎯",
    title: "Walk the line",
    body: "After a hit, ships are straight — fire the cardinal neighbor, then keep going down that axis.",
  },
  {
    emoji: "🧭",
    title: "Checkerboard your shots",
    body: "When hunting blind, alternate cells like a checkerboard. The destroyer (length 2) can't hide between them.",
  },
  {
    emoji: "🛡",
    title: "Don't bunch your fleet",
    body: "Ships can't touch — but the smart AI exploits clusters. Spread out across all four corners.",
  },
  {
    emoji: "⏱",
    title: "Blitz mode is for closers",
    body: "Three minutes is plenty if you commit. Hesitation, not bad luck, is what kills your timer.",
  },
  {
    emoji: "🏆",
    title: "Daily first win = bonus coins",
    body: "Your first ranked win each day pays a multiplier. Log in once a day to keep it stacking.",
  },
  {
    emoji: "🎓",
    title: "Skip the tutorial — once",
    body: "You can finish Training Mode in under two minutes and pocket 25 coins plus the Graduate badge.",
  },
  {
    emoji: "📐",
    title: "Two hits, one axis",
    body: "Got two hits in a row? Stop guessing — the rest of that ship is on the same line. Walk both ends.",
  },
  {
    emoji: "💀",
    title: "Sunk ≠ done",
    body: "When a ship sinks, neighbors of its cells are now safe. Cross them off — that intel narrows the hunt.",
  },
  {
    emoji: "🎲",
    title: "Easy AI is for accuracy stats",
    body: "Padding your accuracy? Cadet difficulty fires randomly — perfect for grinding hit-rate badges.",
  },
  {
    emoji: "🤝",
    title: "Online matches pay too",
    body: "PvP wins grant coins (capped per opponent per day). Bring a friend and split the bounty.",
  },
];

function tipIndexForToday(): number {
  const d = new Date();
  // Days since the Unix epoch in local time, modulo tip count.
  const day = Math.floor(
    (d.getTime() - d.getTimezoneOffset() * 60_000) / 86_400_000
  );
  return ((day % TIPS.length) + TIPS.length) % TIPS.length;
}

export function TipOfTheDay() {
  const [idx, setIdx] = useState<number | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIdx(tipIndexForToday());
  }, []);

  if (idx === null) return null;
  const tip = TIPS[idx];
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-3xl p-4 sm:p-5 flex items-start gap-4 relative overflow-hidden"
    >
      <div
        aria-hidden
        className="absolute -top-12 -left-12 w-32 h-32 rounded-full pointer-events-none"
        style={{
          background:
            "radial-gradient(circle, color-mix(in oklab, var(--accent-3) 35%, transparent), transparent 70%)",
        }}
      />
      <div className="relative z-10 text-4xl">{tip.emoji}</div>
      <div className="relative z-10 min-w-0">
        <div className="text-[10px] uppercase tracking-[0.4em] text-fg-dim">
          Tip of the day
        </div>
        <div className="font-extrabold text-lg neon-text mt-1">{tip.title}</div>
        <p className="text-sm text-fg-dim mt-1 leading-relaxed">{tip.body}</p>
      </div>
    </motion.div>
  );
}
