"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { onCoinGain } from "@/lib/economy";
import { playCoin } from "@/lib/sounds";

interface Toast {
  id: string;
  amount: number;
  reason?: string;
}

// Mounted globally (in AuthProvider). Listens for coin-gain events emitted
// by game-end rewards, referral claims, etc., and shows floating pills.
export function CoinAnimation() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const off = onCoinGain((amount, reason) => {
      if (amount <= 0) return;
      const id = `c_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      setToasts((prev) => [...prev, { id, amount, reason }]);
      try {
        playCoin();
      } catch {
        // Audio unavailable — keep going silently.
      }
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 2200);
    });
    return off;
  }, []);

  return (
    <div className="pointer-events-none fixed top-20 right-4 sm:right-6 z-[60] flex flex-col items-end gap-2">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, x: 30, scale: 0.85 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 380, damping: 22 }}
            className="glass neon-border rounded-2xl px-4 py-2 flex items-center gap-2"
            style={{
              boxShadow:
                "0 0 0 1px color-mix(in oklab, var(--accent) 60%, transparent), 0 0 28px color-mix(in oklab, var(--accent-2) 40%, transparent)",
            }}
          >
            <span
              className="text-2xl font-extrabold tabular-nums"
              style={{
                color: "var(--accent)",
                textShadow: "0 0 14px var(--accent)",
              }}
            >
              +{t.amount}
            </span>
            <span className="text-xl">⚓</span>
            {t.reason && (
              <span className="text-[11px] uppercase tracking-[0.2em] text-fg-dim ml-1">
                {t.reason}
              </span>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
