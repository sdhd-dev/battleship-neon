"use client";

import { motion } from "framer-motion";
import { GameRecord, PlayerStats } from "@/lib/game/types";

interface StatsPanelProps {
  stats: PlayerStats;
  history: GameRecord[];
  onDeleteEntry: (id: string) => void;
  onClearAll: () => void;
}

export function StatsPanel({ stats, history, onDeleteEntry, onClearAll }: StatsPanelProps) {
  const accuracy = stats.shotsFired ? Math.round((stats.shotsHit / stats.shotsFired) * 100) : 0;
  const winRate = stats.gamesPlayed ? Math.round((stats.wins / stats.gamesPlayed) * 100) : 0;

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Wins" value={stats.wins} hue="accent" />
        <StatCard label="Losses" value={stats.losses} hue="accent-2" />
        <StatCard label="Win Rate" value={`${winRate}%`} hue="accent-3" />
        <StatCard label="Accuracy" value={`${accuracy}%`} hue="accent" />
      </div>

      <div className="glass rounded-3xl p-5">
        <div className="flex items-center justify-between mb-3 gap-3">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-[0.3em] text-fg-dim">Last Battles</div>
            <h3 className="text-xl font-bold neon-text">Game History</h3>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-fg-dim tabular-nums">{history.length} games</span>
            {history.length > 0 && (
              <button
                onClick={() => {
                  if (confirm("Clear all history, stats and leaderboard entry?")) onClearAll();
                }}
                className="rounded-lg px-2.5 py-1 text-xs border border-white/15 hover:border-accent-2/60 hover:text-accent-2"
              >
                Clear all
              </button>
            )}
          </div>
        </div>
        <div className="max-h-[320px] overflow-y-auto pr-1">
          {history.length === 0 ? (
            <div className="text-fg-dim text-sm text-center py-8">No games yet — start a match.</div>
          ) : (
            <ul className="divide-y divide-white/5">
              {history.map((g, i) => (
                <motion.li
                  key={g.id}
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: Math.min(i * 0.02, 0.3) }}
                  className="py-2 grid grid-cols-[auto_1fr_auto] items-center gap-3 text-sm"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={
                        g.result === "win"
                          ? "text-accent font-bold w-10"
                          : "text-accent-2/80 font-bold w-10"
                      }
                    >
                      {g.result === "win" ? "WIN" : "LOSS"}
                    </span>
                    <span className="text-fg-dim text-[10px] uppercase tracking-wider w-14">{g.difficulty}</span>
                    <span className="text-fg-dim text-[10px] uppercase tracking-wider w-14">{g.mode}</span>
                  </div>
                  <div className="text-fg-dim text-xs flex gap-3 justify-end tabular-nums whitespace-nowrap">
                    <span className="w-12 text-right">
                      {Math.round((g.shotsHit / Math.max(1, g.shotsFired)) * 100)}%
                    </span>
                    <span className="w-10 text-right">{Math.round(g.durationMs / 1000)}s</span>
                    <span>{new Date(g.date).toLocaleDateString()}</span>
                  </div>
                  <button
                    onClick={() => onDeleteEntry(g.id)}
                    aria-label="Delete game"
                    title="Delete this game"
                    className="text-fg-dim hover:text-accent-2 text-lg leading-none px-1"
                  >
                    ×
                  </button>
                </motion.li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, hue }: { label: string; value: number | string; hue: string }) {
  const color =
    hue === "accent" ? "var(--accent)" : hue === "accent-2" ? "var(--accent-2)" : "var(--accent-3)";
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-2xl p-4 flex flex-col justify-between min-h-[88px]"
    >
      <div className="text-[11px] uppercase tracking-[0.3em] text-fg-dim">{label}</div>
      <div
        className="text-3xl font-extrabold mt-1 tabular-nums leading-none"
        style={{ color, textShadow: `0 0 18px ${color}` }}
      >
        {value}
      </div>
    </motion.div>
  );
}
