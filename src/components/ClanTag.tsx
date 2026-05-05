"use client";

import { useEffect, useState } from "react";
import { ClanRow, getClanByUsername } from "@/lib/clans";
import { supabaseEnabled } from "@/lib/supabase/client";

interface ClanTagProps {
  username?: string | null;
  clan?: ClanRow | null;
  size?: "sm" | "md";
  fetch?: boolean;
}

// Inline `[TAG]` chip rendered next to a player's username. Pass a
// preloaded `clan` to skip the lookup, or pass `username` + `fetch` to
// hit the cache and load lazily.
export function ClanTag({
  username,
  clan: provided,
  size = "sm",
  fetch: shouldFetch,
}: ClanTagProps) {
  const [clan, setClan] = useState<ClanRow | null>(provided ?? null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setClan(provided ?? null);
  }, [provided]);

  useEffect(() => {
    if (provided !== undefined && provided !== null) return;
    if (!shouldFetch) return;
    if (!username) return;
    if (!supabaseEnabled()) return;
    let cancelled = false;
    getClanByUsername(username).then((c) => {
      if (!cancelled) setClan(c);
    });
    return () => {
      cancelled = true;
    };
  }, [username, provided, shouldFetch]);

  if (!clan) return null;

  const px = size === "md" ? "px-2 py-[2px]" : "px-1.5 py-[1px]";
  const text = size === "md" ? "text-[11px]" : "text-[10px]";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border font-mono font-bold tabular-nums whitespace-nowrap ${px} ${text}`}
      style={{
        color: clan.color,
        borderColor: `${clan.color}88`,
        background: `${clan.color}1a`,
        textShadow: `0 0 6px ${clan.color}`,
      }}
      title={`${clan.name} · ${clan.tag}`}
    >
      <span aria-hidden>{clan.emblem}</span>
      <span>[{clan.tag}]</span>
    </span>
  );
}
