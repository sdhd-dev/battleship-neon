"use client";

import { AnimatePresence, motion } from "framer-motion";
import clsx from "clsx";
import { useAuth } from "./AuthProvider";

const SKINS = [
  { id: "default", name: "Standard Hull", grad: "linear-gradient(135deg,#00f0ff,#7c5cff)" },
  { id: "neon", name: "Neon Drift", grad: "linear-gradient(135deg,#ff2bd6,#7c5cff)" },
  { id: "phantom", name: "Phantom Steel", grad: "linear-gradient(135deg,#1a1f3a,#3b4279)" },
  { id: "nebula", name: "Nebula Veil", grad: "linear-gradient(135deg,#5b21b6,#ff2bd6,#00f0ff)" },
  { id: "solar", name: "Solar Flare", grad: "linear-gradient(135deg,#fbbf24,#ef4444,#7c2d12)" },
  { id: "abyss", name: "Abyss Mirror", grad: "linear-gradient(135deg,#020617,#0ea5e9,#020617)" },
];

interface UpgradeModalProps {
  open: boolean;
  onClose: () => void;
}

export function UpgradeModal({ open, onClose }: UpgradeModalProps) {
  const { profile, setProfile } = useAuth();

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
        >
          <motion.div
            initial={{ y: 20, scale: 0.95 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: 10, scale: 0.97 }}
            onClick={(e) => e.stopPropagation()}
            className="glass neon-border rounded-3xl p-6 sm:p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.3em] text-fg-dim">Battleship</div>
                <h2 className="text-3xl font-extrabold title-grad">Upgrade to Pro</h2>
                <p className="text-sm text-fg-dim mt-1 max-w-md">
                  Unlock custom ship skins, animated victory FX, an exclusive captain badge, and priority leaderboard placement.
                </p>
              </div>
              <button onClick={onClose} className="text-fg-dim hover:text-fg text-2xl leading-none">
                ×
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-5">
              {SKINS.map((skin) => {
                const locked = !profile.pro && skin.id !== "default";
                const active = profile.shipSkin === skin.id;
                return (
                  <button
                    key={skin.id}
                    onClick={() => {
                      if (locked) return;
                      setProfile({ ...profile, shipSkin: skin.id });
                    }}
                    className={clsx(
                      "relative rounded-2xl p-3 text-left border transition-all",
                      active ? "border-accent shadow-[0_0_18px_rgba(0,240,255,0.4)]" : "border-white/10 hover:border-white/30",
                      locked && "opacity-80"
                    )}
                  >
                    <div className="h-16 rounded-lg" style={{ background: skin.grad }} />
                    <div className="mt-2 text-sm font-semibold">{skin.name}</div>
                    <div className="text-xs text-fg-dim">{skin.id === "default" ? "Free" : "Pro"}</div>
                    {locked && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-2xl text-2xl">
                        🔒
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="mt-6 grid sm:grid-cols-2 gap-4 items-center">
              <div className="text-sm text-fg-dim">
                <ul className="space-y-1">
                  <li>· Six premium hull skins</li>
                  <li>· Captain rank badge on the leaderboard</li>
                  <li>· Animated kill-cam on every sinking</li>
                  <li>· Priority queue for tournaments (coming soon)</li>
                </ul>
              </div>
              <div className="flex flex-col gap-2 items-stretch">
                {profile.pro ? (
                  <div className="rounded-xl px-4 py-3 text-center bg-accent/15 border border-accent/40">
                    Pro Captain · ✓ Active
                  </div>
                ) : (
                  <>
                    <div className="text-3xl font-extrabold neon-text text-center">$4.99/mo</div>
                    <button
                      className="neon-btn rounded-xl px-4 py-3 font-semibold pulse-glow"
                      onClick={() => {
                        setProfile({ ...profile, pro: true });
                      }}
                    >
                      Upgrade to Pro
                    </button>
                    <div className="text-[11px] text-fg-dim text-center">Demo — unlocks instantly, no payment.</div>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
