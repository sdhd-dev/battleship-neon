"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { POWER_DEFS, PowerType, listPowerDefs, readInventory } from "@/lib/powers";
import { LocalProfile, PROFILE_CHANGE_EVENT, loadProfile } from "@/lib/storage";

// Read-only Arsenal display for the home page sidebar / profile area.
// Lists each owned power with its count; renders a placeholder hint
// when the inventory is empty.
export function ArsenalPanel() {
  const [profile, setProfile] = useState<LocalProfile | null>(null);

  useEffect(() => {
    const refresh = () => setProfile(loadProfile());
    refresh();
    window.addEventListener(PROFILE_CHANGE_EVENT, refresh);
    return () => window.removeEventListener(PROFILE_CHANGE_EVENT, refresh);
  }, []);

  if (!profile) {
    return (
      <div className="glass rounded-2xl p-4">
        <div className="text-[11px] uppercase tracking-[0.3em] text-fg-dim">
          ⚡ Your arsenal
        </div>
        <div className="text-xs text-fg-dim mt-2">Loading…</div>
      </div>
    );
  }

  const inventory = readInventory(profile);
  const totalCount = inventory.reduce((acc, e) => acc + e.count, 0);

  return (
    <div className="glass rounded-2xl p-4">
      <div className="flex items-baseline justify-between">
        <div className="text-[11px] uppercase tracking-[0.3em] text-fg-dim">
          ⚡ Your arsenal
        </div>
        <div className="text-[10px] text-fg-dim tabular-nums">
          {totalCount} item{totalCount === 1 ? "" : "s"}
        </div>
      </div>
      {totalCount === 0 ? (
        <div className="text-xs text-fg-dim mt-2 leading-relaxed">
          Empty. Win <span className="font-bold" style={{ color: "#5eead4" }}>Secret Word</span> mode to roll the roulette and earn battle powers.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3">
          {listPowerDefs().map((def) => {
            const count = inventory.find((e) => e.type === def.type)?.count ?? 0;
            if (count === 0) return null;
            return (
              <PowerCard key={def.type} type={def.type} count={count} />
            );
          })}
        </div>
      )}
      {profile.secretWordWins ? (
        <div className="text-[11px] text-fg-dim mt-3 border-t border-white/5 pt-2">
          Secret Word wins:{" "}
          <span className="font-bold tabular-nums" style={{ color: "#5eead4" }}>
            {profile.secretWordWins}
          </span>
        </div>
      ) : null}
    </div>
  );
}

function PowerCard({ type, count }: { type: PowerType; count: number }) {
  const def = POWER_DEFS[type];
  return (
    <motion.div
      whileHover={{ y: -1 }}
      className="rounded-xl border border-white/10 bg-black/30 p-2.5 grid gap-1 relative overflow-hidden"
      style={{
        borderColor: `color-mix(in oklab, ${def.color} 40%, transparent)`,
      }}
    >
      <div
        aria-hidden
        className="absolute -top-6 -right-6 w-16 h-16 rounded-full pointer-events-none"
        style={{
          background: `radial-gradient(circle, ${def.color}66, transparent 70%)`,
        }}
      />
      <div className="flex items-center justify-between relative z-10">
        <span className="text-2xl" style={{ filter: `drop-shadow(0 0 6px ${def.color})` }}>
          {def.icon}
        </span>
        <span
          className="font-bold tabular-nums text-sm"
          style={{ color: def.color, textShadow: `0 0 8px ${def.color}` }}
        >
          ×{count}
        </span>
      </div>
      <div className="text-[11px] font-semibold leading-tight relative z-10">{def.name}</div>
      <div className="text-[10px] text-fg-dim leading-tight relative z-10">{def.blurb}</div>
    </motion.div>
  );
}
