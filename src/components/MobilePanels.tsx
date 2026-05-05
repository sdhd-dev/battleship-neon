"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { StatsPanel } from "./StatsPanel";
import { ArsenalPanel } from "./ArsenalPanel";
import { Leaderboard } from "./Leaderboard";
import { SocialPanel } from "./SocialPanel";
import { GameRecord, PlayerStats } from "@/lib/game/types";

const TABS = [
  { id: "stats", label: "Stats", icon: "📊" },
  { id: "arsenal", label: "Arsenal", icon: "⚡" },
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
  const scrollerRef = useRef<HTMLDivElement>(null);
  const slotRefs = useRef<Partial<Record<TabId, HTMLDivElement | null>>>({});

  useEffect(() => {
    const root = scrollerRef.current;
    if (!root) return;
    const obs = new IntersectionObserver(
      (entries) => {
        let best: { id: TabId; ratio: number } | null = null;
        for (const e of entries) {
          const id = (e.target as HTMLElement).dataset.tab as TabId | undefined;
          if (!id) continue;
          if (!best || e.intersectionRatio > best.ratio) {
            best = { id, ratio: e.intersectionRatio };
          }
        }
        if (best && best.ratio > 0.55) setActive(best.id);
      },
      { root, threshold: [0.25, 0.55, 0.85] }
    );
    Object.values(slotRefs.current).forEach((el) => {
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, []);

  const goTo = (id: TabId) => {
    setActive(id);
    const el = slotRefs.current[id];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
    }
  };

  return (
    <div className="grid gap-3 lg:hidden">
      <div className="sticky top-2 z-20">
        <div
          className="glass rounded-full p-1 flex gap-1 backdrop-blur-md no-scrollbar"
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
                onClick={() => goTo(t.id)}
                className={clsx(
                  "flex-1 min-w-0 rounded-full px-2 py-2 text-[11px] font-semibold tracking-wider uppercase transition-all",
                  "flex items-center justify-center gap-1.5",
                  isActive
                    ? "neon-btn"
                    : "text-fg-dim hover:text-fg active:scale-[0.97]"
                )}
              >
                <span aria-hidden className="text-sm leading-none">
                  {t.icon}
                </span>
                <span className="truncate">{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div
        ref={scrollerRef}
        className={clsx(
          "flex overflow-x-auto snap-x snap-mandatory gap-4 -mx-4 px-4 pb-2 items-start",
          "no-scrollbar overscroll-x-contain scroll-smooth",
        )}
        style={{ touchAction: "pan-x pan-y" }}
      >
        {TABS.map((t) => (
          <div
            key={t.id}
            data-tab={t.id}
            ref={(el) => {
              slotRefs.current[t.id] = el;
            }}
            className="snap-start shrink-0 basis-full min-w-0 w-full"
          >
            {t.id === "stats" && (
              <StatsPanel
                stats={stats}
                history={history}
                onDeleteEntry={onDeleteEntry}
                onClearAll={onClearAll}
              />
            )}
            {t.id === "arsenal" && <ArsenalPanel />}
            {t.id === "ranks" && <Leaderboard />}
            {t.id === "friends" && <SocialPanel />}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-center gap-1.5 pt-1">
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
