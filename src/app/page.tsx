"use client";

import { useEffect, useState } from "react";
import { GameUI } from "@/components/GameUI";
import { TopBar } from "@/components/TopBar";
import { Leaderboard } from "@/components/Leaderboard";
import { StatsPanel } from "@/components/StatsPanel";
import { UpgradeModal } from "@/components/UpgradeModal";
import { TournamentBanner } from "@/components/TournamentBanner";
import { SocialPanel } from "@/components/SocialPanel";
import { ArsenalPanel } from "@/components/ArsenalPanel";
import { SecretWordProgress } from "@/components/SecretWordProgress";
import { CustomShipCard } from "@/components/CustomShipCard";
import { MobilePanels } from "@/components/MobilePanels";
import { SiteFooter, TelegramLink } from "@/components/SiteFooter";
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
    <div className="bg-field min-h-screen overflow-x-hidden max-w-[100vw]">
      <TopBar onUpgrade={() => setUpgradeOpen(true)} />
      <main className="relative z-10 max-w-7xl mx-auto px-4 py-4 sm:p-6 grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_360px] gap-6 pb-16">
        <section className="min-w-0 grid grid-cols-[minmax(0,1fr)] gap-5">
          <TournamentBanner />
          <GameUI onStatsUpdated={refresh} />
          <MobilePanels
            stats={stats}
            history={history}
            onDeleteEntry={handleDeleteEntry}
            onClearAll={handleClearAll}
          />
          <div className="lg:hidden grid gap-3">
            <button
              onClick={() => setUpgradeOpen(true)}
              className="neon-btn rounded-2xl px-4 py-3 font-semibold pulse-glow"
            >
              ✦ Upgrade to Pro · Unlock Skins
            </button>
            <div className="text-[11px] text-fg-dim text-center leading-relaxed pb-2">
              Built with Next.js · Tailwind · Framer Motion · Supabase.
            </div>
          </div>
        </section>
        <aside className="hidden lg:grid gap-5 content-start lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto lg:pr-1">
          <StatsPanel
            stats={stats}
            history={history}
            onDeleteEntry={handleDeleteEntry}
            onClearAll={handleClearAll}
          />
          <ArsenalPanel />
          <SecretWordProgress />
          <CustomShipCard />
          <Leaderboard />
          <SocialPanel />
          <div
            className="glass rounded-2xl p-4 grid gap-2"
            style={{
              border: "1px solid rgba(42,171,238,0.45)",
              boxShadow: "0 0 18px rgba(42,171,238,0.25)",
            }}
          >
            <div className="text-[11px] uppercase tracking-[0.3em] text-fg-dim">
              💬 Join Community
            </div>
            <div className="text-sm leading-relaxed">
              Found a bug? Have an idea? Join our Telegram!
            </div>
            <TelegramLink>💬 Open Telegram</TelegramLink>
          </div>
          <button
            onClick={() => setUpgradeOpen(true)}
            className="neon-btn rounded-2xl px-4 py-3 font-semibold pulse-glow"
          >
            ✦ Upgrade to Pro · Unlock Skins
          </button>
          <div className="text-[11px] text-fg-dim text-center leading-relaxed">
            Built with Next.js · Tailwind · Framer Motion · Supabase.<br />
            Probability-density AI · 3-min blitz · AI coach.
          </div>
        </aside>
      </main>
      <SiteFooter />
      <UpgradeModal open={upgradeOpen} onClose={() => setUpgradeOpen(false)} />
    </div>
  );
}
