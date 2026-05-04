"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { onLevelUp } from "@/lib/economy";
import { titleForLevel } from "@/lib/progression";
import { playLevelUp } from "@/lib/sounds";

// Big neon flash + arpeggio sting on level-up.
export function LevelUpOverlay() {
  const [level, setLevel] = useState<number | null>(null);

  useEffect(() => {
    return onLevelUp((lvl) => {
      setLevel(lvl);
      try {
        playLevelUp();
      } catch {
        /* audio unavailable — silent */
      }
      window.setTimeout(() => setLevel(null), 2400);
    });
  }, []);

  return (
    <AnimatePresence>
      {level !== null && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[70] pointer-events-none flex items-center justify-center"
        >
          {/* full-screen neon flash */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.85, 0.45, 0] }}
            transition={{ duration: 1.4, times: [0, 0.18, 0.5, 1] }}
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse at center, color-mix(in oklab, var(--accent) 55%, transparent) 0%, color-mix(in oklab, var(--accent-2) 35%, transparent) 35%, transparent 75%)",
            }}
          />
          {/* expanding rings */}
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              initial={{ scale: 0.4, opacity: 0.7 }}
              animate={{ scale: 3.2, opacity: 0 }}
              transition={{ duration: 1.6, delay: i * 0.18, ease: "easeOut" }}
              className="absolute w-72 h-72 rounded-full border-2"
              style={{
                borderColor: "var(--accent)",
                boxShadow:
                  "0 0 32px var(--accent), inset 0 0 32px var(--accent-2)",
              }}
            />
          ))}
          {/* badge */}
          <motion.div
            initial={{ scale: 0.6, y: 20, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 22, delay: 0.05 }}
            className="relative glass neon-border rounded-3xl px-10 py-8 text-center"
          >
            <div className="text-[10px] uppercase tracking-[0.5em] text-fg-dim">
              Promotion
            </div>
            <div
              className="text-5xl sm:text-6xl font-extrabold mt-2"
              style={{
                color: "var(--accent)",
                textShadow:
                  "0 0 24px var(--accent), 0 0 48px var(--accent-2)",
              }}
            >
              LEVEL {level}
            </div>
            <div className="text-xl sm:text-2xl font-bold neon-text mt-1">
              {titleForLevel(level)}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
