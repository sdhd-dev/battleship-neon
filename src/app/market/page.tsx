"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import clsx from "clsx";
import { TopBar } from "@/components/TopBar";
import { UpgradeModal } from "@/components/UpgradeModal";
import { useAuth } from "@/components/AuthProvider";
import { POWER_DEFS, PowerType } from "@/lib/powers";
import {
  ItemType,
  MarketListing,
  PowerListingData,
  ShipListingData,
  buyListing,
  cancelListing,
  fetchActiveListings,
  fetchMyListings,
} from "@/lib/market";
import { findShipKind, findSkin } from "@/lib/workshop";
import { getSupabase } from "@/lib/supabase/client";

type Filter = "all" | "power" | "ship";
type Sort = "newest" | "cheapest" | "expensive";
type Tab = "browse" | "mine";

export default function MarketPage() {
  const { profile, username, cloudEnabled } = useAuth();
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("browse");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("newest");
  const [listings, setListings] = useState<MarketListing[]>([]);
  const [myListings, setMyListings] = useState<MarketListing[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const refresh = useCallback(async () => {
    if (!cloudEnabled) return;
    const [active, mine] = await Promise.all([
      fetchActiveListings(),
      username ? fetchMyListings() : Promise.resolve([] as MarketListing[]),
    ]);
    setListings(active);
    setMyListings(mine);
    setLoading(false);
  }, [cloudEnabled, username]);

  useEffect(() => {
    if (!cloudEnabled) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    void refresh();
  }, [refresh, cloudEnabled]);

  // Realtime: listen to inserts/updates on market_listings and refetch.
  useEffect(() => {
    if (!cloudEnabled) return;
    const sb = getSupabase();
    if (!sb) return;
    const channel = sb
      .channel("market-listings")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "market_listings" },
        () => {
          void refresh();
        }
      )
      .subscribe();
    return () => {
      void channel.unsubscribe();
    };
  }, [cloudEnabled, refresh]);

  const visible = useMemo(() => {
    let xs = listings;
    if (filter !== "all") xs = xs.filter((l) => l.item_type === filter);
    if (sort === "cheapest") xs = [...xs].sort((a, b) => a.price - b.price);
    else if (sort === "expensive") xs = [...xs].sort((a, b) => b.price - a.price);
    return xs;
  }, [listings, filter, sort]);

  const onBuy = async (l: MarketListing) => {
    setBusyId(l.id);
    await buyListing(l);
    setBusyId(null);
    void refresh();
  };

  const onCancel = async (l: MarketListing) => {
    setBusyId(l.id);
    await cancelListing(l);
    setBusyId(null);
    void refresh();
  };

  const myUid = useMemo(() => {
    // Server seller_id matches the auth user id; we use this to flag own
    // listings on the browse tab so the buyer view shows "Your listing".
    if (!username || myListings.length === 0) return null;
    return myListings[0]?.seller_id ?? null;
  }, [username, myListings]);

  return (
    <div className="bg-field min-h-screen overflow-x-hidden max-w-[100vw]">
      <TopBar onUpgrade={() => setUpgradeOpen(true)} />
      <main className="relative z-10 max-w-6xl mx-auto px-4 py-4 sm:p-6 grid gap-6 pb-16">
        <header className="flex items-end justify-between flex-wrap gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.4em] text-fg-dim">
              Open Trade Network
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold title-grad">
              🛒 Global Market
            </h1>
            <p className="text-sm text-fg-dim mt-1 max-w-2xl">
              Trade powers and custom ships with captains across the network.
              Set your own price — coins flow instantly when a listing sells.
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
              ⚓ {(profile.coins ?? 0).toLocaleString()}
            </div>
          </div>
        </header>

        {!cloudEnabled && (
          <div className="glass rounded-2xl p-4 text-sm text-fg-dim">
            The market requires cloud sync. Set Supabase env vars to enable.
          </div>
        )}
        {cloudEnabled && !username && (
          <div className="glass rounded-2xl p-4 text-sm text-fg-dim">
            Sign in to buy or list items.{" "}
            <Link href="/auth" className="text-accent underline">
              Sign in →
            </Link>
          </div>
        )}

        <div className="flex gap-2 flex-wrap">
          <TabBtn active={tab === "browse"} onClick={() => setTab("browse")}>
            Browse
          </TabBtn>
          <TabBtn active={tab === "mine"} onClick={() => setTab("mine")}>
            My Listings ({myListings.filter((m) => m.status === "active").length})
          </TabBtn>
        </div>

        {tab === "browse" && (
          <>
            <div className="flex flex-wrap gap-2 items-center">
              <FilterBtn active={filter === "all"} onClick={() => setFilter("all")}>
                All
              </FilterBtn>
              <FilterBtn
                active={filter === "power"}
                onClick={() => setFilter("power")}
              >
                ⚡ Powers
              </FilterBtn>
              <FilterBtn active={filter === "ship"} onClick={() => setFilter("ship")}>
                ⚓ Ships
              </FilterBtn>
              <div className="flex-1" />
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as Sort)}
                className="rounded-xl bg-black/40 border border-white/15 px-3 py-2 text-sm"
              >
                <option value="newest">Newest</option>
                <option value="cheapest">Cheapest</option>
                <option value="expensive">Most Expensive</option>
              </select>
            </div>

            {loading && mounted && (
              <div className="text-sm text-fg-dim">Loading the market…</div>
            )}

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <AnimatePresence>
                {visible.map((l) => (
                  <ListingCard
                    key={l.id}
                    listing={l}
                    isOwn={myUid !== null && l.seller_id === myUid}
                    canBuy={!!username && (profile.coins ?? 0) >= l.price}
                    busy={busyId === l.id}
                    onBuy={() => onBuy(l)}
                  />
                ))}
              </AnimatePresence>
            </div>

            {!loading && visible.length === 0 && (
              <div className="glass rounded-2xl p-8 text-center text-fg-dim">
                No listings match. Be the first to drop something on the market.
              </div>
            )}
          </>
        )}

        {tab === "mine" && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {myListings.length === 0 ? (
              <div className="glass rounded-2xl p-8 text-center text-fg-dim sm:col-span-2 lg:col-span-3">
                Nothing listed yet. List a power from your arsenal or a custom
                ship from the workshop.
              </div>
            ) : (
              myListings.map((l) => (
                <MyListingCard
                  key={l.id}
                  listing={l}
                  busy={busyId === l.id}
                  onCancel={() => onCancel(l)}
                />
              ))
            )}
          </div>
        )}

        <a
          href="https://t.me/battleshipNfactorial"
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-2xl px-4 py-3 text-sm font-semibold flex items-center justify-center gap-2"
          style={{
            color: "#2AABEE",
            border: "1px solid rgba(42,171,238,0.5)",
            background: "rgba(42,171,238,0.10)",
            boxShadow: "0 0 18px rgba(42,171,238,0.35)",
          }}
        >
          💬 Found a bug or have an idea? Join our Telegram community →
        </a>

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

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "rounded-xl px-4 py-2 text-sm font-semibold",
        active ? "neon-btn" : "border border-white/15 hover:bg-white/5"
      )}
    >
      {children}
    </button>
  );
}

function FilterBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "rounded-lg px-3 py-1.5 text-xs font-semibold",
        active
          ? "border border-accent/60 bg-accent/15 text-accent"
          : "border border-white/15 hover:bg-white/5"
      )}
    >
      {children}
    </button>
  );
}

function ItemPreview({
  type,
  data,
}: {
  type: ItemType;
  data: PowerListingData | ShipListingData | Record<string, unknown>;
}) {
  if (type === "power") {
    const def = POWER_DEFS[(data as PowerListingData).type as PowerType];
    if (!def) return <div className="h-24 rounded-lg bg-black/30" />;
    return (
      <div
        className="h-28 rounded-lg relative overflow-hidden grid place-items-center"
        style={{
          background: `radial-gradient(circle at 50% 50%, color-mix(in oklab, ${def.color} 35%, transparent), rgba(0,0,0,0.4))`,
          border: `1px solid color-mix(in oklab, ${def.color} 50%, transparent)`,
        }}
      >
        <div className="text-5xl" style={{ filter: `drop-shadow(0 0 12px ${def.color})` }}>
          {def.icon}
        </div>
        <div
          className="absolute bottom-1 left-2 right-2 text-[11px] font-bold text-center"
          style={{ color: def.color, textShadow: `0 0 8px ${def.color}` }}
        >
          {def.name}
        </div>
      </div>
    );
  }
  const ship = data as ShipListingData;
  const kind = findShipKind(ship.type);
  const skin = findSkin(ship.skin);
  return (
    <div
      className="h-28 rounded-lg relative overflow-hidden grid place-items-center px-2"
      style={{
        background: skin.gradient,
        border: `1px solid color-mix(in oklab, ${skin.glow} 55%, transparent)`,
        boxShadow: `0 0 18px color-mix(in oklab, ${skin.glow} 30%, transparent)`,
      }}
    >
      <div className="absolute inset-0 bg-black/30" />
      <div className="relative z-10 text-center">
        <div
          className="text-base font-extrabold"
          style={{ textShadow: `0 0 12px ${skin.glow}` }}
        >
          {ship.badge} {ship.name}
        </div>
        <div className="text-[10px] text-white/85 mt-1">
          {kind.name} · {kind.length} cells · {ship.powers.length} power
          {ship.powers.length === 1 ? "" : "s"}
        </div>
      </div>
    </div>
  );
}

function ListingCard({
  listing,
  isOwn,
  canBuy,
  busy,
  onBuy,
}: {
  listing: MarketListing;
  isOwn: boolean;
  canBuy: boolean;
  busy: boolean;
  onBuy: () => void;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      whileHover={{ y: -2 }}
      className="glass rounded-2xl p-3 grid gap-3 border border-white/10 relative overflow-hidden"
    >
      <ItemPreview type={listing.item_type} data={listing.item_data} />
      <div className="flex items-baseline justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.3em] text-fg-dim">
            {listing.item_type === "power" ? "Power" : "Custom Ship"}
          </div>
          <div className="text-sm font-bold truncate">
            @{listing.seller_username}
          </div>
        </div>
        <div className="text-right">
          <div
            className="text-2xl font-extrabold tabular-nums"
            style={{ color: "#fbbf24", textShadow: "0 0 10px #fbbf24" }}
          >
            ⚓ {listing.price}
          </div>
        </div>
      </div>
      <button
        onClick={onBuy}
        disabled={isOwn || !canBuy || busy}
        className={clsx(
          "rounded-xl px-4 py-2.5 text-sm font-semibold min-h-[44px]",
          isOwn
            ? "border border-white/15 text-fg-dim cursor-not-allowed"
            : canBuy
              ? "neon-btn"
              : "border border-white/15 text-fg-dim cursor-not-allowed"
        )}
      >
        {busy
          ? "…"
          : isOwn
            ? "Your listing"
            : canBuy
              ? `Buy for ⚓ ${listing.price}`
              : "Not enough coins"}
      </button>
    </motion.div>
  );
}

function MyListingCard({
  listing,
  busy,
  onCancel,
}: {
  listing: MarketListing;
  busy: boolean;
  onCancel: () => void;
}) {
  const sold = listing.status === "sold";
  const cancelled = listing.status === "cancelled";
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-2xl p-3 grid gap-3 border border-white/10 relative overflow-hidden"
    >
      <ItemPreview type={listing.item_type} data={listing.item_data} />
      {sold && (
        <div
          className="absolute top-2 right-2 px-2 py-1 rounded-md text-[10px] font-extrabold"
          style={{
            color: "#34d399",
            border: "1px solid rgba(52,211,153,0.6)",
            background: "rgba(52,211,153,0.18)",
            textShadow: "0 0 8px #34d399",
          }}
        >
          SOLD
        </div>
      )}
      {cancelled && (
        <div className="absolute top-2 right-2 px-2 py-1 rounded-md text-[10px] font-extrabold border border-white/15 bg-black/40 text-fg-dim">
          CANCELLED
        </div>
      )}
      <div className="flex items-baseline justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.3em] text-fg-dim">
            {listing.item_type === "power" ? "Power" : "Custom Ship"}
          </div>
          {sold && listing.buyer_username && (
            <div className="text-xs text-fg-dim truncate">
              Sold to @{listing.buyer_username}
            </div>
          )}
        </div>
        <div
          className="text-xl font-extrabold tabular-nums"
          style={{ color: "#fbbf24", textShadow: "0 0 10px #fbbf24" }}
        >
          ⚓ {listing.price}
        </div>
      </div>
      {listing.status === "active" ? (
        <button
          onClick={onCancel}
          disabled={busy}
          className="rounded-xl px-4 py-2.5 text-sm font-semibold border border-rose-300/40 hover:bg-rose-300/10 text-rose-200 disabled:opacity-50 min-h-[44px]"
        >
          {busy ? "…" : "Cancel & return"}
        </button>
      ) : (
        <div className="rounded-xl px-4 py-2.5 text-sm text-center text-fg-dim border border-white/10">
          {sold ? "Coins credited" : "Item returned"}
        </div>
      )}
    </motion.div>
  );
}
