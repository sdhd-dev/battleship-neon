"use client";

import { motion } from "framer-motion";
import clsx from "clsx";
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
        <div className="max-h-[360px] overflow-y-auto pr-1 -mr-1">
          {history.length === 0 ? (
            <div className="text-fg-dim text-sm text-center py-8">No games yet — start a match.</div>
          ) : (
            <ul className="grid gap-1.5">
              {history.map((g, i) => {
                const accuracy = Math.round((g.shotsHit / Math.max(1, g.shotsFired)) * 100);
                const seconds = Math.round(g.durationMs / 1000);
                const isWin = g.result === "win";
                return (
                  <motion.li
                    key={g.id}
                    initial={{ opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: Math.min(i * 0.02, 0.3) }}
                    className={clsx(
                      "rounded-xl border px-3 py-2.5 flex items-center gap-3 text-sm transition-colors",
                      isWin
                        ? "border-accent/25 bg-accent/[0.04] hover:bg-accent/[0.08]"
                        : "border-accent-2/25 bg-accent-2/[0.04] hover:bg-accent-2/[0.08]"
                    )}
                  >
                    <div
                      className={clsx(
                        "shrink-0 w-12 text-center text-[11px] font-extrabold tracking-wider rounded-md py-1.5",
                        isWin
                          ? "bg-accent/20 text-accent"
                          : "bg-accent-2/20 text-accent-2"
                      )}
                    >
                      {isWin ? "WIN" : "LOSS"}
                    </div>
                    <div className="min-w-0 flex-1 grid gap-0.5">
                      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-fg-dim">
                        <span className="font-semibold">{g.difficulty}</span>
                        <span>·</span>
                        <span>{g.mode}</span>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-fg-dim tabular-nums">
                        <span title="Accuracy" className="font-semibold text-fg">
                          {accuracy}%
                        </span>
                        <span>·</span>
                        <span>{seconds}s</span>
                        <span>·</span>
                        <span>{new Date(g.date).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => onDeleteEntry(g.id)}
                      aria-label="Delete game"
                      title="Delete this game"
                      className="shrink-0 text-fg-dim hover:text-accent-2 text-xl leading-none w-7 h-7 rounded-md hover:bg-white/5 grid place-items-center"
                    >
                      ×
                    </button>
                  </motion.li>
                );
              })}
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
