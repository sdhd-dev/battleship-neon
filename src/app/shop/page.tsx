"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import clsx from "clsx";
import { TopBar } from "@/components/TopBar";
import { UpgradeModal } from "@/components/UpgradeModal";
import { useAuth } from "@/components/AuthProvider";
import { PromoRedeem } from "@/components/PromoRedeem";
import {
  BOARD_THEMES,
  PROFILE_BADGES,
  PRO_PRICE,
  SHIP_SKINS,
  ShopItem,
  ThemeItem,
  BadgeItem,
  SkinItem,
} from "@/lib/shop-catalog";

type Tab = "skins" | "themes" | "badges" | "pro";

export default function ShopPage() {
  const { profile, setProfile } = useAuth();
  const [tab, setTab] = useState<Tab>("skins");
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The profile is hydrated from localStorage on the client only, so its
  // server-rendered shape (default zeros) won't match the post-mount
  // values (real coins, owned cosmetics, active selections). Gate the
  // profile-dependent UI on `mounted` to avoid hydration mismatches in
  // the card grids; the balance has suppressHydrationWarning for the
  // same reason but stays visible since it's just a text swap.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const owned = new Set(profile.ownedCosmetics ?? []);
  const coins = profile.coins ?? 0;

  function purchase(item: ShopItem) {
    setError(null);
    if (owned.has(item.id)) return;
    if (item.price > coins) {
      setError(`Not enough coins. Need ⚓ ${item.price - coins} more.`);
      return;
    }
    setProfile({
      ...profile,
      coins: coins - item.price,
      ownedCosmetics: [...new Set([...(profile.ownedCosmetics ?? []), item.id])],
    });
  }

  function setActiveSkin(id: string) {
    setProfile({ ...profile, shipSkin: id });
  }
  function setActiveTheme(id: string) {
    setProfile({ ...profile, activeBoardTheme: id });
  }
  function setActiveBadge(id: string | undefined) {
    setProfile({ ...profile, activeBadge: id });
  }
  function purchasePro() {
    setError(null);
    if (profile.pro) return;
    if (coins < PRO_PRICE) {
      setError(`Not enough coins. Need ⚓ ${PRO_PRICE - coins} more.`);
      return;
    }
    setProfile({ ...profile, coins: coins - PRO_PRICE, pro: true });
  }

  return (
    <div className="bg-field min-h-screen">
      <TopBar onUpgrade={() => setUpgradeOpen(true)} />
      <main className="relative z-10 max-w-5xl mx-auto p-4 sm:p-6 grid gap-6 pb-16">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.4em] text-fg-dim">
              Quartermaster
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold title-grad">
              Naval Shop
            </h1>
            <p className="text-sm text-fg-dim mt-1">
              Earn ⚓ Naval Coins by winning matches. Spend them on hull skins,
              board themes, profile badges, and Pro status.
            </p>
          </div>
          <div className="rounded-2xl px-4 py-3 border border-amber-300/40 bg-amber-300/10">
            <div className="text-[10px] uppercase tracking-[0.3em] text-fg-dim">
              Balance
            </div>
            <div
              suppressHydrationWarning
              className="text-2xl font-extrabold tabular-nums"
              style={{ color: "#fbbf24", textShadow: "0 0 12px #fbbf24" }}
            >
              ⚓ {coins.toLocaleString()}
            </div>
          </div>
        </div>

        <PromoRedeem />

        <Tabs tab={tab} setTab={setTab} />

        {error && (
          <div className="neon-error rounded-xl px-3 py-2 text-sm">{error}</div>
        )}

        {mounted && tab === "skins" && (
          <SectionGrid>
            {SHIP_SKINS.map((s) => (
              <SkinCard
                key={s.id}
                item={s}
                owned={s.price === 0 || profile.pro || owned.has(s.id)}
                active={profile.shipSkin === s.id}
                affordable={coins >= s.price}
                onBuy={() => purchase(s)}
                onActivate={() => setActiveSkin(s.id)}
              />
            ))}
          </SectionGrid>
        )}

        {mounted && tab === "themes" && (
          <SectionGrid>
            {BOARD_THEMES.map((t) => (
              <ThemeCard
                key={t.id}
                item={t}
                owned={t.price === 0 || owned.has(t.id)}
                active={(profile.activeBoardTheme ?? "default") === t.id}
                affordable={coins >= t.price}
                onBuy={() => purchase(t)}
                onActivate={() => setActiveTheme(t.id)}
              />
            ))}
          </SectionGrid>
        )}

        {mounted && tab === "badges" && (
          <SectionGrid>
            <BadgeCard
              empty
              active={!profile.activeBadge}
              onActivate={() => setActiveBadge(undefined)}
            />
            {PROFILE_BADGES.map((b) => (
              <BadgeCard
                key={b.id}
                item={b}
                owned={owned.has(b.id)}
                active={profile.activeBadge === b.id}
                affordable={coins >= b.price}
                onBuy={() => purchase(b)}
                onActivate={() => setActiveBadge(b.id)}
              />
            ))}
          </SectionGrid>
        )}

        {mounted && tab === "pro" && (
          <ProCard
            owned={profile.pro}
            affordable={coins >= PRO_PRICE}
            onBuy={purchasePro}
          />
        )}

        <div className="text-center">
          <Link
            href="/"
            className="text-sm text-fg-dim hover:text-fg underline-offset-2 hover:underline"
          >
            ← Back to deck
          </Link>
        </div>
      </main>
      <UpgradeModal open={upgradeOpen} onClose={() => setUpgradeOpen(false)} />
    </div>
  );
}

function Tabs({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const items: Array<{ id: Tab; label: string }> = [
    { id: "skins", label: "Ship Skins" },
    { id: "themes", label: "Board Themes" },
    { id: "badges", label: "Badges" },
    { id: "pro", label: "Pro Status" },
  ];
  return (
    <div className="flex gap-2 flex-wrap">
      {items.map((i) => (
        <button
          key={i.id}
          onClick={() => setTab(i.id)}
          className={clsx(
            "rounded-xl px-4 py-2 text-sm font-semibold transition-colors",
            tab === i.id
              ? "neon-btn"
              : "border border-white/15 hover:bg-white/5"
          )}
        >
          {i.label}
        </button>
      ))}
    </div>
  );
}

function SectionGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
      {children}
    </div>
  );
}

function SkinCard({
  item,
  owned,
  active,
  affordable,
  onBuy,
  onActivate,
}: {
  item: SkinItem;
  owned: boolean;
  active: boolean;
  affordable: boolean;
  onBuy: () => void;
  onActivate: () => void;
}) {
  return (
    <motion.div
      whileHover={{ y: -2 }}
      className={clsx(
        "glass rounded-2xl p-3 flex flex-col gap-2 border",
        active
          ? "border-accent shadow-[0_0_18px_rgba(0,240,255,0.4)]"
          : "border-white/10"
      )}
    >
      <div className="h-20 rounded-lg" style={{ background: item.gradient }} />
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="font-semibold text-sm">{item.name}</div>
          <div className="text-xs text-fg-dim">
            {item.price === 0 ? "Free" : `⚓ ${item.price}`}
          </div>
        </div>
        <ActionButton
          owned={owned}
          active={active}
          affordable={affordable}
          onBuy={onBuy}
          onActivate={onActivate}
        />
      </div>
    </motion.div>
  );
}

function ThemeCard({
  item,
  owned,
  active,
  affordable,
  onBuy,
  onActivate,
}: {
  item: ThemeItem;
  owned: boolean;
  active: boolean;
  affordable: boolean;
  onBuy: () => void;
  onActivate: () => void;
}) {
  return (
    <motion.div
      whileHover={{ y: -2 }}
      className={clsx(
        "glass rounded-2xl p-3 flex flex-col gap-2 border",
        active
          ? "border-accent shadow-[0_0_18px_rgba(0,240,255,0.4)]"
          : "border-white/10"
      )}
    >
      <div className="h-20 rounded-lg" style={{ background: item.swatch }} />
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="font-semibold text-sm">{item.name}</div>
          <div className="text-xs text-fg-dim">
            {item.price === 0 ? "Free" : `⚓ ${item.price}`}
          </div>
        </div>
        <ActionButton
          owned={owned}
          active={active}
          affordable={affordable}
          onBuy={onBuy}
          onActivate={onActivate}
        />
      </div>
    </motion.div>
  );
}

function BadgeCard({
  item,
  owned,
  active,
  affordable,
  onBuy,
  onActivate,
  empty,
}: {
  item?: BadgeItem;
  owned?: boolean;
  active?: boolean;
  affordable?: boolean;
  onBuy?: () => void;
  onActivate?: () => void;
  empty?: boolean;
}) {
  if (empty) {
    return (
      <motion.div
        whileHover={{ y: -2 }}
        className={clsx(
          "glass rounded-2xl p-3 flex flex-col gap-2 border",
          active
            ? "border-accent shadow-[0_0_18px_rgba(0,240,255,0.4)]"
            : "border-white/10"
        )}
      >
        <div className="h-20 rounded-lg flex items-center justify-center bg-black/30 text-fg-dim text-2xl">
          ∅
        </div>
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="font-semibold text-sm">No badge</div>
            <div className="text-xs text-fg-dim">Free</div>
          </div>
          <button
            onClick={onActivate}
            disabled={active}
            className={clsx(
              "rounded-lg px-3 py-1.5 text-xs font-semibold",
              active
                ? "border border-accent/50 text-accent"
                : "border border-white/15 hover:bg-white/5"
            )}
          >
            {active ? "Active" : "Use"}
          </button>
        </div>
      </motion.div>
    );
  }
  if (!item) return null;
  if (item.earnedOnly) {
    return (
      <motion.div
        whileHover={{ y: -2 }}
        className={clsx(
          "glass rounded-2xl p-3 flex flex-col gap-2 border",
          active
            ? "border-accent shadow-[0_0_18px_rgba(0,240,255,0.4)]"
            : "border-white/10"
        )}
      >
        <div className="h-20 rounded-lg flex items-center justify-center bg-gradient-to-br from-accent-3/20 to-accent-2/20 text-5xl">
          {item.emoji}
        </div>
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="font-semibold text-sm">{item.name}</div>
            <div className="text-xs text-fg-dim">{item.hint ?? "Earned reward"}</div>
          </div>
          {active ? (
            <span className="rounded-lg px-3 py-1.5 text-xs font-semibold border border-accent/50 text-accent">
              Active
            </span>
          ) : owned ? (
            <button
              onClick={onActivate}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold neon-btn"
            >
              Equip
            </button>
          ) : (
            <span className="rounded-lg px-3 py-1.5 text-xs font-semibold border border-white/15 text-fg-dim">
              Locked
            </span>
          )}
        </div>
      </motion.div>
    );
  }
  return (
    <motion.div
      whileHover={{ y: -2 }}
      className={clsx(
        "glass rounded-2xl p-3 flex flex-col gap-2 border",
        active
          ? "border-accent shadow-[0_0_18px_rgba(0,240,255,0.4)]"
          : "border-white/10"
      )}
    >
      <div className="h-20 rounded-lg flex items-center justify-center bg-gradient-to-br from-accent-3/20 to-accent-2/20 text-5xl">
        {item.emoji}
      </div>
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="font-semibold text-sm">{item.name}</div>
          <div className="text-xs text-fg-dim">⚓ {item.price}</div>
        </div>
        <ActionButton
          owned={!!owned}
          active={!!active}
          affordable={!!affordable}
          onBuy={onBuy ?? (() => {})}
          onActivate={onActivate ?? (() => {})}
        />
      </div>
    </motion.div>
  );
}

function ActionButton({
  owned,
  active,
  affordable,
  onBuy,
  onActivate,
}: {
  owned: boolean;
  active: boolean;
  affordable: boolean;
  onBuy: () => void;
  onActivate: () => void;
}) {
  if (active) {
    return (
      <span className="rounded-lg px-3 py-1.5 text-xs font-semibold border border-accent/50 text-accent">
        Active
      </span>
    );
  }
  if (owned) {
    return (
      <button
        onClick={onActivate}
        className="rounded-lg px-3 py-1.5 text-xs font-semibold neon-btn"
      >
        Equip
      </button>
    );
  }
  return (
    <button
      onClick={onBuy}
      disabled={!affordable}
      className={clsx(
        "rounded-lg px-3 py-1.5 text-xs font-semibold",
        affordable
          ? "neon-btn"
          : "border border-white/15 text-fg-dim cursor-not-allowed"
      )}
    >
      {affordable ? "Buy" : "Locked"}
    </button>
  );
}

function ProCard({
  owned,
  affordable,
  onBuy,
}: {
  owned: boolean;
  affordable: boolean;
  onBuy: () => void;
}) {
  return (
    <div className="glass neon-border rounded-3xl p-6 sm:p-8 grid sm:grid-cols-2 gap-6 items-center">
      <div>
        <div className="text-[10px] uppercase tracking-[0.4em] text-fg-dim">
          Premium
        </div>
        <h3 className="text-3xl font-extrabold title-grad">Pro Status</h3>
        <p className="text-sm text-fg-dim mt-2 max-w-md">
          Unlock all six hull skins, the captain rank badge on the leaderboard,
          and animated kill-cam on every sinking — permanent, no expiry.
        </p>
        <ul className="text-sm text-fg-dim mt-3 space-y-1">
          <li>· All current and future ship skins</li>
          <li>· Pro captain badge on the leaderboard</li>
          <li>· Animated kill-cam on every sinking</li>
          <li>· Priority queue for tournaments</li>
        </ul>
      </div>
      <div className="flex flex-col gap-3 items-stretch">
        <div
          className="text-5xl font-extrabold neon-text text-center tabular-nums"
          style={{ color: "#fbbf24", textShadow: "0 0 18px #fbbf24" }}
        >
          ⚓ {PRO_PRICE}
        </div>
        {owned ? (
          <div className="rounded-xl px-4 py-3 text-center bg-accent/15 border border-accent/40">
            ✦ Pro Captain · Active
          </div>
        ) : (
          <button
            onClick={onBuy}
            disabled={!affordable}
            className={clsx(
              "rounded-xl px-4 py-3 font-semibold pulse-glow",
              affordable
                ? "neon-btn"
                : "border border-white/15 text-fg-dim cursor-not-allowed"
            )}
          >
            {affordable ? "Buy with Naval Coins" : "Need more coins"}
          </button>
        )}
      </div>
    </div>
  );
}
