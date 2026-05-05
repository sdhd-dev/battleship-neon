"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { TopBar } from "@/components/TopBar";
import { TeamBattleGame } from "@/components/TeamBattleGame";
import { UpgradeModal } from "@/components/UpgradeModal";
import { useAuth } from "@/components/AuthProvider";
import { getCurrentPlayerId } from "@/lib/game/multiplayer";

export default function TeamRoomPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = use(params);
  const { profile } = useAuth();
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [playerId, setPlayerId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const id = await getCurrentPlayerId();
      if (!cancelled) setPlayerId(id);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="bg-field min-h-screen">
      <TopBar onUpgrade={() => setUpgradeOpen(true)} />
      <main className="relative z-10 max-w-7xl mx-auto p-4 sm:p-6 pb-16">
        {!playerId ? (
          <div className="glass rounded-3xl p-8 text-center text-fg-dim">
            Establishing comms…
          </div>
        ) : (
          <TeamBattleGame
            roomCode={code}
            myPlayerId={playerId}
            myName={profile.username || "Captain"}
          />
        )}
        <div className="mt-6 text-center">
          <Link
            href="/"
            className="text-xs text-fg-dim hover:text-fg tracking-[0.2em] uppercase"
          >
            ← Back to home
          </Link>
        </div>
      </main>
      <UpgradeModal open={upgradeOpen} onClose={() => setUpgradeOpen(false)} />
    </div>
  );
}
