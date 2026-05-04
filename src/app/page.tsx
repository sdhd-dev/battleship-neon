"use client";

import { useEffect, useState } from "react";
import { GameUI } from "@/components/GameUI";
import { TopBar } from "@/components/TopBar";
import { Leaderboard } from "@/components/Leaderboard";
import { StatsPanel } from "@/components/StatsPanel";
import { UpgradeModal } from "@/components/UpgradeModal";
import { TournamentBanner } from "@/components/TournamentBanner";
import { SocialPanel } from "@/components/SocialPanel";
import { GameRecord, PlayerStats } from "@/lib/game/types";
import {
  clearHistory,
  defaultStats,
  deleteHistoryEntry,
  loadHistory,
  loadStats,
} from "@/lib/storage";

export default function Home() {
  const [stats, setStats] = useState<PlayerStats>(defaultStats);
  const [history, setHistory] = useState<GameRecord[]>([]);
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  const refresh = () => {
    setStats(loadStats());
    setHistory(loadHistory());
  };

  const handleDeleteEntry = (id: string) => {
    setHistory(deleteHistoryEntry(id));
  };

  const handleClearAll = () => {
    clearHistory();
    refresh();
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, []);

  return (
    <div className="bg-field min-h-screen">
      <TopBar onUpgrade={() => setUpgradeOpen(true)} />
      <main className="relative z-10 max-w-7xl mx-auto p-4 sm:p-6 grid lg:grid-cols-[1fr_360px] gap-6 pb-16">
        <section className="min-w-0 grid gap-5">
          <TournamentBanner />
          <GameUI onStatsUpdated={refresh} />
        </section>
        <aside className="grid gap-5 content-start lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto lg:pr-1">
          <StatsPanel
            stats={stats}
            history={history}
            onDeleteEntry={handleDeleteEntry}
            onClearAll={handleClearAll}
          />
          <Leaderboard />
          <SocialPanel />
          <button
            onClick={() => setUpgradeOpen(true)}
            className="neon-btn rounded-2xl px-4 py-3 font-semibold pulse-glow"
          >
            ✦ Upgrade to Pro · Unlock Skins
          </button>
          <div className="text-[11px] text-fg-dim text-center leading-relaxed">
            Built with Next.js 14 · Tailwind · Framer Motion · Supabase.<br />
            Probability-density AI · 3-min blitz · AI coach.
          </div>
        </aside>
      </main>
      <UpgradeModal open={upgradeOpen} onClose={() => setUpgradeOpen(false)} />
    </div>
  );
}
