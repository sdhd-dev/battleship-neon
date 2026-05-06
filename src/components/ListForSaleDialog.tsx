"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { MAX_PRICE, MIN_PRICE, validatePrice } from "@/lib/market";

interface Props {
  open: boolean;
  title: string;
  subtitle?: string;
  busy?: boolean;
  onClose: () => void;
  onConfirm: (price: number) => Promise<void> | void;
}

export function ListForSaleDialog({
  open,
  title,
  subtitle,
  busy,
  onClose,
  onConfirm,
}: Props) {
  const [raw, setRaw] = useState<string>("100");
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  // Render-via-portal needs document — defer until client mount.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRaw("100");
      setError(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Lock body scroll while the modal is up so the page underneath
  // doesn't shift when the scrollbar disappears.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const submit = async () => {
    const price = parseInt(raw, 10);
    const err = validatePrice(price);
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    await onConfirm(price);
  };

  // Portal to <body> — parent cards use `.glass` (backdrop-filter), which
  // creates a containing block and would otherwise pin our `fixed inset-0`
  // overlay to the card instead of the viewport.
  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="list-for-sale-modal"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-[180] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ type: "spring", stiffness: 280, damping: 22 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            className="relative w-full max-w-md rounded-3xl p-6 sm:p-7 grid gap-3"
            style={{
              border: "1px solid rgba(0,240,255,0.4)",
              boxShadow: "0 0 24px rgba(0,240,255,0.25)",
              background:
                "radial-gradient(circle at 50% 0%, rgba(0,240,255,0.12), rgba(8,12,30,0.92))",
            }}
          >
            <div className="text-[10px] uppercase tracking-[0.4em] text-fg-dim">
              List for sale
            </div>
            <h3 className="text-2xl font-extrabold neon-text">{title}</h3>
            {subtitle && <div className="text-sm text-fg-dim">{subtitle}</div>}

            <label className="text-[10px] uppercase tracking-[0.3em] text-fg-dim mt-2">
              Price (⚓ {MIN_PRICE}–{MAX_PRICE})
            </label>
            <div className="flex items-center gap-2">
              <span className="text-2xl">⚓</span>
              <input
                autoFocus
                type="number"
                min={MIN_PRICE}
                max={MAX_PRICE}
                step={1}
                inputMode="numeric"
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
                className="flex-1 rounded-xl bg-black/40 border border-white/15 px-4 py-3 text-xl font-bold tabular-nums"
              />
            </div>
            {error && (
              <div className="neon-error rounded-xl px-3 py-2 text-sm">
                {error}
              </div>
            )}
            <div className="text-[11px] text-fg-dim leading-relaxed">
              The item leaves your inventory immediately. You can cancel from
              the My Listings tab to take it back.
            </div>
            <div className="flex gap-2 justify-end mt-2">
              <button
                onClick={onClose}
                disabled={busy}
                className="rounded-xl px-4 py-2 border border-white/15 hover:bg-white/5 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={busy}
                className="neon-btn rounded-xl px-5 py-2 font-semibold disabled:opacity-50"
              >
                {busy ? "Listing…" : "Confirm listing"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
