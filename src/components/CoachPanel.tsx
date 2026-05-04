"use client";

import { motion } from "framer-motion";
import { CoachReport } from "@/lib/game/coach";

const GRADE_HUE: Record<CoachReport["grade"], string> = {
  S: "var(--accent)",
  A: "var(--accent)",
  B: "var(--accent-3)",
  C: "var(--accent-2)",
  D: "#ff3550",
};

export function CoachPanel({ report }: { report: CoachReport }) {
  const color = GRADE_HUE[report.grade];
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass neon-border rounded-3xl p-6 sm:p-7"
    >
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-fg-dim">AI Coach</div>
          <h2 className="text-2xl sm:text-3xl font-extrabold neon-text">{report.headline}</h2>
        </div>
        <div
          className="w-20 h-20 rounded-2xl flex items-center justify-center font-extrabold text-4xl"
          style={{
            background: `radial-gradient(circle, color-mix(in oklab, ${color} 35%, transparent), transparent 70%)`,
            boxShadow: `0 0 24px ${color}`,
            color,
          }}
        >
          {report.grade}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
        <Bar label="Accuracy" value={report.accuracy} />
        <Bar label="Hunt efficiency" value={report.huntEfficiency} />
        <Bar label="Parity score" value={report.parityScore} />
        <Bar label="Edge bias" value={report.edgeBias} inverse />
      </div>

      <div className="mt-5">
        <div className="text-xs uppercase tracking-[0.3em] text-fg-dim mb-2">Strategic Notes</div>
        <ul className="space-y-2">
          {report.tips.map((tip, i) => (
            <motion.li
              key={i}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.08 }}
              className="text-sm leading-relaxed pl-4 border-l-2 border-accent/60"
            >
              {tip}
            </motion.li>
          ))}
        </ul>
      </div>
    </motion.div>
  );
}

function Bar({ label, value, inverse }: { label: string; value: number; inverse?: boolean }) {
  const pct = Math.max(0, Math.min(1, value));
  const display = Math.round(pct * 100);
  const score = inverse ? 1 - pct : pct;
  const hue = score > 0.6 ? "var(--accent)" : score > 0.35 ? "var(--accent-3)" : "var(--accent-2)";
  return (
    <div className="rounded-xl p-3 bg-black/20 border border-white/10">
      <div className="text-[11px] uppercase tracking-[0.2em] text-fg-dim">{label}</div>
      <div className="text-xl font-bold mt-1" style={{ color: hue }}>{display}%</div>
      <div className="h-1.5 bg-white/10 rounded-full mt-2 overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${display}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          style={{ background: hue, boxShadow: `0 0 10px ${hue}` }}
          className="h-full"
        />
      </div>
    </div>
  );
}
