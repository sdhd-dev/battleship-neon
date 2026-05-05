"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import clsx from "clsx";
import { POWER_DEFS, PowerType, readInventory } from "@/lib/powers";
import { LocalProfile, PROFILE_CHANGE_EVENT, loadProfile } from "@/lib/storage";

interface Props {
  // Which power is currently armed (preview / awaiting cell selection).
  activePower: PowerType | null;
  // Click on a power tile in the bar. Caller decides whether to arm
  // (target-selecting powers) or trigger immediately (passive ones).
  onSelect: (type: PowerType) => void;
  // Optional context label (e.g. "Hostile fleet" / "Your fleet").
  label?: string;
  // Subset of powers to display. Defaults to all five battle powers.
  show?: PowerType[];
  // Whether the bar is interactive at all.
  disabled?: boolean;
  // Per-power disabled state (e.g. shield already queued).
  isPowerDisabled?: (type: PowerType) => boolean;
}

const DEFAULT_POWERS: PowerType[] = [
  "precision",
  "airstrike",
  "radar",
  "shield",
  "smokescreen",
];

export function PowerBar({
  activePower,
  onSelect,
  label,
  show,
  disabled,
  isPowerDisabled,
}: Props) {
  const [profile, setProfile] = useState<LocalProfile | null>(null);

  useEffect(() => {
    const refresh = () => setProfile(loadProfile());
    refresh();
    window.addEventListener(PROFILE_CHANGE_EVENT, refresh);
    return () => window.removeEventListener(PROFILE_CHANGE_EVENT, refresh);
  }, []);

  if (!profile) return null;
  const inv = readInventory(profile);
  const totalCount = inv.reduce((a, e) => a + e.count, 0);
  if (totalCount === 0) return null;

  const powers = show ?? DEFAULT_POWERS;

  return (
    <div className="glass rounded-2xl px-3 py-2.5 sm:p-4 grid gap-2">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <div className="text-[10px] uppercase tracking-[0.3em] text-fg-dim">
          ⚡ Arsenal {label ? <span className="ml-2 text-fg-dim/70">· {label}</span> : null}
        </div>
        <AnimatePresence>
          {activePower && (
            <motion.div
              key="hint"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="text-[10px] font-bold"
              style={{
                color: POWER_DEFS[activePower].color,
                textShadow: `0 0 8px ${POWER_DEFS[activePower].color}`,
              }}
            >
              {POWER_DEFS[activePower].name} armed — pick a target
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <div className="flex flex-wrap gap-2">
        {powers.map((type) => {
          const def = POWER_DEFS[type];
          const count = inv.find((e) => e.type === type)?.count ?? 0;
          if (count === 0) return null;
          const isActive = activePower === type;
          const tileDisabled = !!disabled || (isPowerDisabled?.(type) ?? false);
          return (
            <motion.button
              key={type}
              type="button"
              whileHover={!tileDisabled ? { y: -1 } : undefined}
              whileTap={!tileDisabled ? { scale: 0.96 } : undefined}
              onClick={() => {
                if (tileDisabled) return;
                onSelect(type);
              }}
              disabled={tileDisabled}
              className={clsx(
                "relative rounded-xl border px-3 py-2 flex items-center gap-2 min-h-[44px]",
                tileDisabled && "opacity-50 cursor-not-allowed",
                isActive && "pulse-glow"
              )}
              style={{
                borderColor: isActive
                  ? def.color
                  : `color-mix(in oklab, ${def.color} 35%, transparent)`,
                background: isActive
                  ? `linear-gradient(135deg, color-mix(in oklab, ${def.color} 30%, transparent), transparent)`
                  : "rgba(0,0,0,0.3)",
                boxShadow: isActive
                  ? `0 0 0 1px ${def.color}, 0 0 22px ${def.color}aa`
                  : undefined,
              }}
              title={`${def.name}: ${def.blurb}`}
            >
              <span className="text-xl" style={{ filter: `drop-shadow(0 0 6px ${def.color})` }}>
                {def.icon}
              </span>
              <span className="grid leading-tight text-left">
                <span className="text-[11px] font-bold" style={{ color: def.color }}>
                  {def.name}
                </span>
                <span className="text-[10px] text-fg-dim tabular-nums">×{count}</span>
              </span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
