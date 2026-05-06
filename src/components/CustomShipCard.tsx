"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LocalProfile, PROFILE_CHANGE_EVENT, loadProfile } from "@/lib/storage";
import { POWER_DEFS } from "@/lib/powers";
import { findShipKind, findSkin } from "@/lib/workshop";

export function CustomShipCard() {
  const [profile, setProfile] = useState<LocalProfile | null>(null);

  useEffect(() => {
    const refresh = () => setProfile(loadProfile());
    refresh();
    window.addEventListener(PROFILE_CHANGE_EVENT, refresh);
    return () => window.removeEventListener(PROFILE_CHANGE_EVENT, refresh);
  }, []);

  if (!profile) return null;
  if (!profile.customShip) {
    if (!profile.customShipUnlocked) return null;
    return (
      <div className="glass rounded-2xl p-4 grid gap-2">
        <div className="text-[11px] uppercase tracking-[0.3em] text-fg-dim">
          ⚓ Custom ship
        </div>
        <div className="text-xs text-fg-dim leading-relaxed">
          Workshop unlocked. Forge your legendary vessel.
        </div>
        <Link
          href="/workshop"
          className="neon-btn rounded-xl px-3 py-2 text-sm font-semibold text-center"
        >
          ⚓ Open Workshop
        </Link>
      </div>
    );
  }

  const ship = profile.customShip;
  const kind = findShipKind(ship.type);
  const skin = findSkin(ship.skin);

  return (
    <div className="glass rounded-2xl p-4 grid gap-3 relative overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-0 opacity-30 pointer-events-none"
        style={{ background: skin.gradient }}
      />
      <div className="relative z-10 grid gap-2">
        <div className="flex items-baseline justify-between gap-2 flex-wrap">
          <div className="text-[11px] uppercase tracking-[0.3em] text-fg-dim">
            ⚓ Custom ship
          </div>
          <Link
            href="/workshop"
            className="text-[11px] font-semibold underline decoration-dotted underline-offset-2"
            style={{ color: "#5eead4" }}
          >
            Edit Ship
          </Link>
        </div>
        <div
          className="text-lg font-extrabold"
          style={{ textShadow: `0 0 12px ${skin.glow}` }}
        >
          {ship.badge} {ship.name}
        </div>
        <div className="text-xs text-fg-dim">
          {kind.name} · {skin.name}
        </div>
        {ship.powers.length > 0 && (
          <div className="grid gap-1.5">
            {ship.powers.map((p, i) => {
              const def = POWER_DEFS[p];
              return (
                <div
                  key={`${p}-${i}`}
                  className="rounded-lg px-2.5 py-1.5 border text-xs flex items-center gap-2"
                  style={{
                    borderColor: def.color,
                    background: `color-mix(in oklab, ${def.color} 14%, transparent)`,
                  }}
                >
                  <span style={{ filter: `drop-shadow(0 0 6px ${def.color})` }}>
                    {def.icon}
                  </span>
                  <span className="font-bold" style={{ color: def.color }}>
                    {def.name}
                  </span>
                  <span className="text-fg-dim ml-auto">+1 at start</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
