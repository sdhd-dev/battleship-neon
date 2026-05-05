"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import clsx from "clsx";
import {
  LeaderboardEntry,
  fetchCloudLeaderboard,
  fetchWeeklyLeaderboard,
  loadLocalLeaderboard,
} from "@/lib/storage";
import { fetchViralCreators } from "@/lib/social";
import { ClanRow, fetchClansByUsernames } from "@/lib/clans";
import { useAuth } from "./AuthProvider";
import { ClanTag } from "./ClanTag";

type Scope = "all" | "weekly";

export function Leaderboard() {
  const { profile, cloudEnabled, isGuest } = useAuth();
  const [scope, setScope] = useState<Scope>("all");
  const [allEntries, setAllEntries] = useState<LeaderboardEntry[]>([]);
  const [weeklyEntries, setWeeklyEntries] = useState<LeaderboardEntry[]>([]);
  const [city, setCity] = useState<string>("ALL");
  const [source, setSource] = useState<"local" | "cloud">("local");
  const [viralCreators, setViralCreators] = useState<Set<string>>(new Set());
  const [clansByUser, setClansByUser] = useState<Map<string, ClanRow>>(new Map());

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setAllEntries(loadLocalLeaderboard());
    setSource("local");
    if (cloudEnabled) {
      fetchCloudLeaderboard().then((cloud) => {
        if (cloud && cloud.length) {
          setAllEntries(cloud);
          setSource("cloud");
        }
      });
      fetchWeeklyLeaderboard().then((weekly) => {
        if (weekly) setWeeklyEntries(weekly);
      });
      fetchViralCreators().then(setViralCreators).catch(() => {});
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [cloudEnabled]);

  const entries = scope === "all" ? allEntries : weeklyEntries;

  useEffect(() => {
    if (!cloudEnabled) return;
    if (entries.length === 0) return;
    const usernames = entries.slice(0, 50).map((e) => e.username);
    fetchClansByUsernames(usernames)
      .then((m) => setClansByUser(m))
      .catch(() => {});
  }, [entries, cloudEnabled]);

  const cities = useMemo(() => {
    const all = new Set<string>(entries.map((e) => e.city));
    return ["ALL", ...Array.from(all).sort()];
  }, [entries]);

  const filtered = city === "ALL" ? entries : entries.filter((e) => e.city === city);

  return (
    <div className="glass rounded-3xl p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-fg-dim">
            {scope === "weekly" ? "🏆 This week" : "Global"}
          </div>
          <h3 className="text-xl font-bold neon-text">
            {scope === "weekly" ? "Weekly Tournament" : "Leaderboard"}
          </h3>
          <div className="text-xs text-fg-dim">
            {scope === "weekly"
              ? "Resets Monday 00:00 UTC · Top 3 win prizes"
              : source === "cloud"
                ? isGuest
                  ? "Cloud rankings · sign in to appear here"
                  : "Cloud-synced via Supabase"
                : "Local + community seed"}
          </div>
        </div>
        <div className="flex gap-2">
          <ScopeToggle scope={scope} setScope={setScope} cloudEnabled={cloudEnabled} />
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
              const goldTop3 = scope === "weekly" && i < 3;
              const isViral = viralCreators.has(e.username.toLowerCase());
              return (
                <motion.tr
                  key={e.username + i}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.015, 0.4) }}
                  className={clsx(
                    "border-t border-white/5",
                    isYou && "bg-accent/15 ring-1 ring-accent/40 rounded-md",
                    goldTop3 && "bg-amber-300/10"
                  )}
                >
                  <td className="py-2 pr-2 font-mono text-fg-dim tabular-nums">{i + 1}</td>
                  <td className="py-2 pr-2 font-semibold truncate max-w-[180px]">
                    {i < 3 && <span className="mr-1">{["🥇", "🥈", "🥉"][i]}</span>}
                    {goldTop3 && (
                      <span
                        className="mr-1 inline-block rounded px-1 text-[9px] font-extrabold tracking-wider align-middle"
                        style={{
                          background: "linear-gradient(135deg,#fbbf24,#f97316)",
                          color: "#1a0e00",
                          boxShadow: "0 0 10px #fbbf24",
                        }}
                      >
                        TOP 3
                      </span>
                    )}
                    {isViral && (
                      <span
                        title="Viral Creator — paid creator program"
                        className="mr-1 inline-block rounded px-1 text-[9px] font-extrabold tracking-wider align-middle"
                        style={{
                          background: "linear-gradient(135deg,#ff7a00,#ff2bd6)",
                          color: "#fff",
                          boxShadow: "0 0 10px #ff2bd6",
                        }}
                      >
                        🔥 VIRAL
                      </span>
                    )}
                    {e.username}
                    {clansByUser.get(e.username.toLowerCase()) && (
                      <span className="ml-1.5 align-middle">
                        <ClanTag clan={clansByUser.get(e.username.toLowerCase())} />
                      </span>
                    )}
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
                  {scope === "weekly"
                    ? "No captains yet this week — be the first."
                    : "No captains in this city yet — be the first."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ScopeToggle({
  scope,
  setScope,
  cloudEnabled,
}: {
  scope: Scope;
  setScope: (s: Scope) => void;
  cloudEnabled: boolean;
}) {
  return (
    <div className="inline-flex rounded-xl border border-white/15 bg-black/30 p-0.5">
      <button
        onClick={() => setScope("all")}
        className={clsx(
          "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
          scope === "all" ? "neon-btn" : "text-fg-dim hover:text-fg"
        )}
      >
        All-time
      </button>
      <button
        onClick={() => setScope("weekly")}
        disabled={!cloudEnabled}
        title={!cloudEnabled ? "Weekly tournament requires cloud sync" : undefined}
        className={clsx(
          "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
          scope === "weekly" ? "neon-btn" : "text-fg-dim hover:text-fg",
          !cloudEnabled && "opacity-40 cursor-not-allowed"
        )}
      >
        🏆 Weekly
      </button>
    </div>
  );
}
