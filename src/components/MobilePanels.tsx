"use client";

import { useState } from "react";
import clsx from "clsx";
import { StatsPanel } from "./StatsPanel";
import { ArsenalPanel } from "./ArsenalPanel";
import { Leaderboard } from "./Leaderboard";
import { SocialPanel } from "./SocialPanel";
import { SecretWordProgress } from "./SecretWordProgress";
import { GameRecord, PlayerStats } from "@/lib/game/types";

const TABS = [
  { id: "stats", label: "Stats", icon: "📊" },
  { id: "arsenal", label: "Arsenal", icon: "⚡" },
  { id: "words", label: "Words", icon: "🔤" },
  { id: "ranks", label: "Ranks", icon: "🏆" },
  { id: "friends", label: "Friends", icon: "👥" },
] as const;

type TabId = (typeof TABS)[number]["id"];

interface Props {
  stats: PlayerStats;
  history: GameRecord[];
  onDeleteEntry: (id: string) => void;
  onClearAll: () => void;
}

export function MobilePanels({ stats, history, onDeleteEntry, onClearAll }: Props) {
  const [active, setActive] = useState<TabId>("stats");

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:hidden min-w-0">
      <div className="sticky top-2 z-20 min-w-0">
        <div
          className="glass rounded-full p-0.5 flex gap-0.5 backdrop-blur-md no-scrollbar w-full"
          role="tablist"
          aria-label="Profile sections"
        >
          {TABS.map((t) => {
            const isActive = active === t.id;
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={isActive}
                onClick={() => setActive(t.id)}
                className={clsx(
                  "flex-1 min-w-0 basis-0 rounded-full px-1 py-1.5 text-[10px] font-semibold tracking-wide uppercase transition-all",
                  "flex items-center justify-center gap-1",
                  isActive
                    ? "neon-btn"
                    : "text-fg-dim hover:text-fg active:scale-[0.97]"
                )}
              >
                <span aria-hidden className="text-[11px] leading-none shrink-0">
                  {t.icon}
                </span>
                <span className="truncate min-w-0">{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="min-w-0 overflow-hidden">
        {active === "stats" && (
          <StatsPanel
            stats={stats}
            history={history}
            onDeleteEntry={onDeleteEntry}
            onClearAll={onClearAll}
          />
        )}
        {active === "arsenal" && <ArsenalPanel />}
        {active === "words" && <SecretWordProgress />}
        {active === "ranks" && <Leaderboard />}
        {active === "friends" && <SocialPanel />}
      </div>

      <div className="flex items-center justify-center gap-1.5 pt-1 pb-2">
        {TABS.map((t) => (
          <span
            key={t.id}
            className={clsx(
              "h-1 rounded-full transition-all duration-300",
              active === t.id
                ? "w-6 bg-accent shadow-[0_0_8px_var(--accent)]"
                : "w-1.5 bg-white/20"
            )}
          />
        ))}
      </div>
    </div>
  );
}
