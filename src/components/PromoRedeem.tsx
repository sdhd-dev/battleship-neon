"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "./AuthProvider";
import { redeemPromoCode } from "@/lib/promo";
import { loadProfile } from "@/lib/storage";
import { emitCoinGain } from "@/lib/economy";
import { notify } from "@/lib/notify";

interface SuccessState {
  coins: number;
  cosmetic: string | null;
  cosmeticName: string | null;
}

export function PromoRedeem() {
  const { setProfile, username, cloudEnabled } = useAuth();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<SuccessState | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setSuccess(null);
    if (!code.trim()) return;

    setBusy(true);
    const result = await redeemPromoCode(code);
    setBusy(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }

    // Apply rewards to local profile (cloud profile will sync via setProfile).
    const current = loadProfile();
    const owned = new Set(current.ownedCosmetics ?? []);
    if (result.rewardCosmetic) owned.add(result.rewardCosmetic);
    const next = {
      ...current,
      coins: (current.coins ?? 0) + result.rewardCoins,
      ownedCosmetics: Array.from(owned),
    };
    setProfile(next);
    if (result.rewardCoins > 0) {
      emitCoinGain(result.rewardCoins, "promo");
      notify(`⚓ +${result.rewardCoins.toLocaleString()} coins from promo code!`, "success");
    } else if (result.rewardCosmetic) {
      notify("✓ Cosmetic unlocked from promo code!", "success");
    }

    setSuccess({
      coins: result.rewardCoins,
      cosmetic: result.rewardCosmetic,
      cosmeticName: result.cosmeticName,
    });
    setCode("");
  };

  const disabled = busy || !cloudEnabled || !username;
  const hint = !cloudEnabled
    ? "Cloud sync required for promo codes."
    : !username
      ? "Sign in to redeem promo codes."
      : null;

  return (
    <section className="glass neon-border rounded-3xl p-4 sm:p-5 grid gap-3">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[10px] uppercase tracking-[0.4em] text-fg-dim">
            Promo Codes
          </div>
          <h2 className="text-xl sm:text-2xl font-extrabold neon-text">
            Activate a code
          </h2>
        </div>
        <p className="text-[11px] text-fg-dim max-w-sm">
          Got a code? Redeem it for coins or exclusive cosmetics. One redemption
          per account per code.
        </p>
      </div>

      <form onSubmit={submit} className="flex gap-2 flex-wrap sm:flex-nowrap">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="ENTER CODE"
          maxLength={32}
          disabled={disabled}
          autoComplete="off"
          spellCheck={false}
          className="neon-input flex-1 font-mono tracking-[0.2em] uppercase pl-3"
          style={{ minWidth: 180 }}
        />
        <button
          type="submit"
          disabled={disabled || !code.trim()}
          className="neon-btn rounded-xl px-5 py-3 text-sm font-bold tracking-wide whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy ? "Activating…" : "Activate"}
        </button>
      </form>

      {hint && !error && !success && (
        <div className="text-[11px] text-fg-dim">{hint}</div>
      )}

      <AnimatePresence>
        {error && (
          <motion.div
            key="err"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="neon-error rounded-xl px-3 py-2 text-sm font-semibold"
          >
            {error}
          </motion.div>
        )}
        {success && (
          <motion.div
            key="ok"
            initial={{ opacity: 0, scale: 0.95, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="rounded-xl px-3 py-2 text-sm border border-accent/50 bg-accent/10"
            style={{ color: "var(--accent)", textShadow: "0 0 8px var(--accent)" }}
          >
            <span className="font-bold">✓ Code redeemed!</span>{" "}
            {success.coins > 0 && <span>+⚓ {success.coins.toLocaleString()}</span>}
            {success.coins > 0 && success.cosmetic && <span> · </span>}
            {success.cosmetic && (
              <span>
                Unlocked{" "}
                <span className="font-semibold">
                  {success.cosmeticName ?? success.cosmetic}
                </span>{" "}
                badge
              </span>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
