"use client";

import { motion } from "framer-motion";
import { ApplyRewardResult } from "@/lib/economy";
import { titleForLevel } from "@/lib/progression";

export function RewardSummary({ result }: { result: ApplyRewardResult }) {
  const { reward, leveledUp, newLevel, profile } = result;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 280, damping: 24 }}
      className="glass neon-border rounded-3xl p-5 sm:p-6 relative overflow-hidden"
    >
      <motion.div
        aria-hidden
        className="absolute -top-16 -right-16 w-48 h-48 rounded-full pointer-events-none"
        style={{
          background:
            "radial-gradient(circle, color-mix(in oklab, #fbbf24 45%, transparent), transparent 70%)",
        }}
        animate={{ scale: [1, 1.2, 1] }}
        transition={{ duration: 4, repeat: Infinity }}
      />
      <div className="relative z-10 grid gap-3">
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <div>
            <div className="text-[10px] uppercase tracking-[0.4em] text-fg-dim">
              Mission rewards
            </div>
            <div className="flex items-baseline gap-3 mt-1">
              <div
                className="text-4xl sm:text-5xl font-extrabold tabular-nums"
                style={{ color: "#fbbf24", textShadow: "0 0 18px #fbbf24" }}
              >
                +{reward.totalCoins}
              </div>
              <span className="text-3xl">⚓</span>
              <div
                className="text-sm font-bold ml-2"
                style={{ color: "var(--accent)" }}
              >
                +{reward.xp} XP
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-[0.3em] text-fg-dim">
              Balance
            </div>
            <div
              className="text-xl font-extrabold tabular-nums"
              style={{ color: "#fbbf24" }}
            >
              ⚓ {(profile.coins ?? 0).toLocaleString()}
            </div>
            <div className="text-[11px] text-fg-dim mt-1">
              Lv {newLevel} · {titleForLevel(newLevel)}
            </div>
          </div>
        </div>

        <ul className="grid gap-1 text-xs sm:text-sm">
          {reward.breakdown.map((b, i) => (
            <li
              key={i}
              className="flex items-center justify-between border-t border-white/5 pt-1"
            >
              <span className="text-fg-dim">{b.label}</span>
              <span
                className="font-bold tabular-nums"
                style={{ color: "var(--accent)" }}
              >
                +{b.coins}
              </span>
            </li>
          ))}
        </ul>

        {leveledUp && (
          <div
            className="rounded-xl px-3 py-2 mt-1 text-sm font-bold text-center"
            style={{
              background:
                "linear-gradient(90deg, color-mix(in oklab, var(--accent) 25%, transparent), color-mix(in oklab, var(--accent-2) 25%, transparent))",
              color: "var(--accent)",
              textShadow: "0 0 10px var(--accent)",
            }}
          >
            ⬆ Promoted to Lv {newLevel} · {titleForLevel(newLevel)}
          </div>
        )}
      </div>
    </motion.div>
  );
}
