"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import clsx from "clsx";
import { LeaderboardEntry, fetchCloudLeaderboard, loadLocalLeaderboard } from "@/lib/storage";
import { useAuth } from "./AuthProvider";

export function Leaderboard() {
  const { profile, cloudEnabled, isGuest } = useAuth();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [city, setCity] = useState<string>("ALL");
  const [source, setSource] = useState<"local" | "cloud">("local");

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setEntries(loadLocalLeaderboard());
    setSource("local");
    if (cloudEnabled) {
      fetchCloudLeaderboard().then((cloud) => {
        if (cloud && cloud.length) {
          setEntries(cloud);
          setSource("cloud");
        }
      });
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [cloudEnabled]);

  const cities = useMemo(() => {
    const all = new Set<string>(entries.map((e) => e.city));
    return ["ALL", ...Array.from(all).sort()];
  }, [entries]);

  const filtered = city === "ALL" ? entries : entries.filter((e) => e.city === city);

  return (
    <div className="glass rounded-3xl p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-fg-dim">Global</div>
          <h3 className="text-xl font-bold neon-text">Leaderboard</h3>
          <div className="text-xs text-fg-dim">
            {source === "cloud"
              ? isGuest
                ? "Cloud rankings · sign in to appear here"
                : "Cloud-synced via Supabase"
              : "Local + community seed"}
          </div>
        </div>
        <select
          value={city}
          onChange={(e) => setCity(e.target.value)}
          className="rounded-xl bg-black/30 border border-white/15 px-3 py-2 text-sm"
        >
          {cities.map((c) => (
            <option key={c} value={c} className="bg-bg">
              {c === "ALL" ? "All cities" : c}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4 max-h-[420px] overflow-y-auto pr-1">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase tracking-wider text-fg-dim">
            <tr>
              <th className="text-left py-2 pr-2">#</th>
              <th className="text-left py-2 pr-2">Captain</th>
              <th className="text-left py-2 pr-2">City</th>
              <th className="text-right py-2 pr-2">W</th>
              <th className="text-right py-2 pr-2">Acc</th>
              <th className="text-right py-2">Rating</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((e, i) => {
              const isYou = e.username.toLowerCase() === profile.username.toLowerCase();
              return (
                <motion.tr
                  key={e.username + i}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.015, 0.4) }}
                  className={clsx(
                    "border-t border-white/5",
                    isYou && "bg-accent/15 ring-1 ring-accent/40 rounded-md"
                  )}
                >
                  <td className="py-2 pr-2 font-mono text-fg-dim tabular-nums">{i + 1}</td>
                  <td className="py-2 pr-2 font-semibold truncate max-w-[140px]">
                    {i < 3 && <span className="mr-1">{["🥇", "🥈", "🥉"][i]}</span>}
                    {e.username}
                    {isYou && <span className="ml-2 text-[10px] uppercase tracking-wider text-accent">You</span>}
                  </td>
                  <td className="py-2 pr-2 text-fg-dim truncate max-w-[120px]">{e.city}</td>
                  <td className="py-2 pr-2 text-right tabular-nums">{e.wins}</td>
                  <td className="py-2 pr-2 text-right tabular-nums">{Math.round(e.accuracy * 100)}%</td>
                  <td className="py-2 text-right font-mono text-accent tabular-nums">{e.rating}</td>
                </motion.tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-6 text-fg-dim">
                  No captains in this city yet — be the first.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
