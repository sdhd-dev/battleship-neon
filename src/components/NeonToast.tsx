"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { NotifyKind, onNotify } from "@/lib/notify";

interface ToastEntry {
  id: string;
  message: string;
  kind: NotifyKind;
}

const KIND_TINT: Record<NotifyKind, { color: string; glow: string }> = {
  info: { color: "var(--accent)", glow: "var(--accent)" },
  success: { color: "var(--accent)", glow: "var(--accent)" },
  error: { color: "var(--accent-2)", glow: "var(--accent-2)" },
};

export function NeonToast() {
  const [entries, setEntries] = useState<ToastEntry[]>([]);

  useEffect(() => {
    return onNotify(({ message, kind }) => {
      const id = `n_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      setEntries((prev) => [...prev, { id, message, kind }]);
      window.setTimeout(() => {
        setEntries((prev) => prev.filter((t) => t.id !== id));
      }, 3600);
    });
  }, []);

  return (
    <div className="pointer-events-none fixed top-20 left-1/2 -translate-x-1/2 z-[70] flex flex-col items-center gap-2">
      <AnimatePresence>
        {entries.map((t) => {
          const tint = KIND_TINT[t.kind];
          return (
            <motion.div
              key={t.id}
              role="status"
              aria-live="polite"
              initial={{ opacity: 0, y: -16, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -16, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 300, damping: 22 }}
              className="glass neon-border rounded-2xl px-5 py-3 max-w-[90vw] text-sm font-semibold text-center"
              style={{
                background: "rgba(10, 10, 26, 0.85)",
                color: tint.color,
                textShadow: `0 0 10px ${tint.glow}`,
                boxShadow: `0 0 0 1px color-mix(in oklab, ${tint.glow} 60%, transparent), 0 0 28px color-mix(in oklab, ${tint.glow} 35%, transparent)`,
              }}
            >
              {t.message}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
