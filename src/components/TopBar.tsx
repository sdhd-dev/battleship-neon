"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useTheme } from "./ThemeProvider";
import { useAuth } from "./AuthProvider";
import {
  progressInLevel,
  titleForLevel,
  xpForLevel,
  xpToNext,
} from "@/lib/progression";
import { buildInviteUrl, fetchReferralStats } from "@/lib/referrals";
import { ClanTag } from "./ClanTag";
import { POWER_DEFS, readInventory } from "@/lib/powers";
import { HowToPlay } from "./HowToPlay";

interface TopBarProps {
  onUpgrade: () => void;
}

export function TopBar({ onUpgrade }: TopBarProps) {
  const router = useRouter();
  const { theme, toggle } = useTheme();
  const { profile, setProfile, username, signOut, cloudEnabled, isGuest } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [referralStats, setReferralStats] = useState<{ count: number; coinsEarned: number }>({
    count: 0,
    coinsEarned: 0,
  });
  const [linkCopied, setLinkCopied] = useState(false);
  const authRef = useRef<HTMLDivElement>(null);

  // Profile is hydrated from localStorage in a useEffect inside AuthProvider,
  // which means the very first render uses the SSR default (zeros). Until we
  // mount on the client, render placeholder zeros so server/client markup
  // matches and avoid flashing stale numbers from the default profile.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const coins = mounted ? profile.coins ?? 0 : 0;
  const xp = mounted ? profile.xp ?? 0 : 0;
  const level = mounted ? profile.level ?? 1 : 1;
  const title = titleForLevel(level);
  const progress = progressInLevel(xp, level);
  const toNext = xpToNext(xp, level);

  useEffect(() => {
    if (!authOpen) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      if (authRef.current && !authRef.current.contains(e.target as Node)) {
        setAuthOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAuthOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [authOpen]);

  useEffect(() => {
    if (!authOpen) return;
    if (!username) return;
    fetchReferralStats(username).then(setReferralStats).catch(() => {});
  }, [authOpen, username]);

  const signedIn = Boolean(username);
  const inviteUrl = buildInviteUrl(profile.username || username || "captain");

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 1500);
    } catch {
      // clipboard unavailable; ignore
    }
  };

  return (
    <header className="relative z-50 flex items-center justify-between px-3 py-3 sm:p-6 gap-1.5 sm:gap-3">
      <div className="flex items-center gap-3 min-w-0 shrink-0 sm:flex-1">
        <Link href="/" className="flex items-center gap-2 sm:gap-3 min-w-0" aria-label="Home">
          <div className="relative shrink-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-accent via-accent-3 to-accent-2 shadow-[0_0_18px_rgba(0,240,255,0.5)]" />
            <motion.div
              className="absolute inset-0 rounded-xl border border-accent/60"
              animate={{ scale: [1, 1.15, 1], opacity: [0.6, 0, 0.6] }}
              transition={{ duration: 2.4, repeat: Infinity }}
            />
          </div>
          <div className="hidden sm:block leading-tight min-w-0">
            <div className="text-[10px] uppercase tracking-[0.4em] text-fg-dim truncate">Naval Combat OS</div>
            <h1 className="text-lg sm:text-2xl font-extrabold title-grad whitespace-nowrap">BATTLESHIP.NEON</h1>
          </div>
        </Link>

        {/* Level + XP bar */}
        <div
          suppressHydrationWarning
          className="hidden md:flex items-center ml-3 px-3 py-1.5 rounded-xl border border-white/10 bg-black/30 min-w-[200px] gap-3"
        >
          <div className="leading-tight">
            <div suppressHydrationWarning className="text-[9px] uppercase tracking-[0.3em] text-fg-dim">
              Lv {level}
            </div>
            <div
              suppressHydrationWarning
              className="text-xs font-bold leading-tight"
              style={{ color: "var(--accent)", textShadow: "0 0 8px var(--accent)" }}
            >
              {title}
            </div>
          </div>
          <div className="flex-1">
            <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
              <motion.div
                className="h-full"
                style={{
                  background:
                    "linear-gradient(90deg, var(--accent), var(--accent-2))",
                  boxShadow: "0 0 8px var(--accent)",
                }}
                animate={{ width: `${Math.round(progress * 100)}%` }}
                transition={{ duration: 0.6, ease: "easeOut" }}
              />
            </div>
            <div suppressHydrationWarning className="text-[9px] text-fg-dim mt-1 tabular-nums">
              {level >= 100 ? "MAX" : `${xp - xpForLevel(level)} / ${xpForLevel(level + 1) - xpForLevel(level)} · ${toNext} to next`}
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        {/* Coin balance — desktop shows count; mobile shows compact icon */}
        <Link
          href="/shop"
          suppressHydrationWarning
          className="hidden sm:inline-flex items-center gap-2 rounded-xl px-3 py-2 border border-amber-300/40 bg-amber-300/10 hover:bg-amber-300/20 transition-colors"
          aria-label="Open shop"
        >
          <span className="text-lg leading-none">⚓</span>
          <span
            suppressHydrationWarning
            className="font-bold tabular-nums text-sm"
            style={{ color: "#fbbf24", textShadow: "0 0 10px #fbbf24" }}
          >
            {coins.toLocaleString()}
          </span>
        </Link>
        <Link
          href="/shop"
          suppressHydrationWarning
          className="sm:hidden inline-flex items-center gap-1 rounded-xl h-9 px-2 border border-amber-300/40 bg-amber-300/10 hover:bg-amber-300/20 text-sm shrink-0"
          aria-label="Open shop"
        >
          <span className="text-base leading-none">⚓</span>
          <span
            suppressHydrationWarning
            className="font-bold tabular-nums text-[11px] leading-none"
            style={{ color: "#fbbf24", textShadow: "0 0 8px #fbbf24" }}
          >
            {coins >= 1000 ? `${(coins / 1000).toFixed(coins >= 10000 ? 0 : 1)}k` : coins}
          </span>
        </Link>

        <Link
          href="/clans"
          className="hidden sm:inline-flex items-center gap-1 rounded-xl px-3 py-2 border border-white/15 hover:bg-white/5 text-sm font-semibold"
          aria-label="Clans"
        >
          <span>⚑</span>
          <span>Clans</span>
        </Link>
        <Link
          href="/market"
          className="hidden sm:inline-flex items-center gap-1 rounded-xl px-3 py-2 border border-white/15 hover:bg-white/5 text-sm font-semibold"
          aria-label="Market"
        >
          <span>🛒</span>
          <span>Market</span>
        </Link>
        <button
          onClick={() => setGuideOpen(true)}
          className="hidden sm:inline-flex items-center gap-1 rounded-xl px-3 py-2 border border-white/15 hover:bg-white/5 text-sm font-semibold"
          aria-label="How to play"
        >
          <span>📖</span>
          <span>Guide</span>
        </button>
        <a
          href="https://t.me/battleshipNfactorial"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Join Telegram community"
          title="Join the Telegram community"
          className="hidden sm:inline-flex items-center justify-center rounded-xl px-2.5 py-2 text-sm font-semibold"
          style={{
            color: "#2AABEE",
            border: "1px solid rgba(42,171,238,0.5)",
            background: "rgba(42,171,238,0.10)",
            boxShadow: "0 0 12px rgba(42,171,238,0.35)",
          }}
        >
          ✈
        </a>
        <button
          onClick={onUpgrade}
          suppressHydrationWarning
          className="hidden sm:inline-flex neon-btn rounded-xl px-3 py-2 text-sm font-semibold"
        >
          {profile.pro ? "✦ Pro" : "Upgrade to Pro"}
        </button>
        <button
          onClick={toggle}
          className="hidden sm:inline-flex rounded-xl px-3 py-2 border border-white/15 hover:bg-white/5 text-sm"
          aria-label="Toggle theme"
        >
          {theme === "dark" ? "☾" : "☀"}
        </button>
        <div className="relative" ref={authRef}>
          <button
            onClick={() => setAuthOpen((o) => !o)}
            suppressHydrationWarning
            aria-label={signedIn ? "Account menu" : "Sign in"}
            className="rounded-xl h-9 sm:h-auto w-9 sm:w-auto sm:px-3 sm:py-2 border border-white/15 hover:bg-white/5 text-sm flex items-center justify-center sm:justify-start gap-2"
          >
            <span
              suppressHydrationWarning
              className="w-6 h-6 rounded-full bg-gradient-to-br from-accent-3 to-accent-2 grid place-items-center text-xs font-bold shrink-0"
            >
              {(profile.username[0] ?? "C").toUpperCase()}
            </span>
            <span suppressHydrationWarning className="hidden sm:inline">
              {signedIn ? profile.username : "Sign in"}
            </span>
            {signedIn && (
              <span className="hidden sm:inline">
                <ClanTag username={username} fetch />
              </span>
            )}
          </button>
          {authOpen && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className="absolute right-0 mt-2 w-[min(20rem,calc(100vw-1.5rem))] glass rounded-2xl p-4 z-50 max-h-[calc(100vh-5rem)] overflow-y-auto"
            >
              {!editingProfile ? (
                <>
                  <div className="text-xs uppercase tracking-[0.3em] text-fg-dim">
                    {signedIn
                      ? "Signed in"
                      : isGuest && profile.isGuest
                        ? "Guest"
                        : cloudEnabled
                          ? "Not signed in"
                          : "Local profile"}
                  </div>
                  <div className="font-semibold mt-1">{profile.username}</div>
                  <div className="text-xs text-fg-dim">{profile.city || "Unknown"}</div>
                  {signedIn && username && (
                    <div className="text-xs text-fg-dim mt-1">@{username}</div>
                  )}

                  {/* Level + coins summary */}
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div className="rounded-lg border border-white/10 bg-black/30 px-3 py-2">
                      <div className="text-[10px] uppercase tracking-[0.3em] text-fg-dim">Rank</div>
                      <div suppressHydrationWarning className="text-sm font-bold" style={{ color: "var(--accent)" }}>
                        Lv {level} · {title}
                      </div>
                    </div>
                    <div className="rounded-lg border border-amber-300/40 bg-amber-300/10 px-3 py-2">
                      <div className="text-[10px] uppercase tracking-[0.3em] text-fg-dim">Coins</div>
                      <div suppressHydrationWarning className="text-sm font-bold" style={{ color: "#fbbf24" }}>
                        ⚓ {coins.toLocaleString()}
                      </div>
                    </div>
                  </div>

                  {/* Mobile-only quick navigation. On larger screens these live in the header. */}
                  <div className="sm:hidden mt-3">
                    <div className="text-[10px] uppercase tracking-[0.3em] text-fg-dim mb-2">
                      Navigate
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <Link
                        href="/clans"
                        onClick={() => setAuthOpen(false)}
                        className="rounded-lg border border-white/10 bg-black/30 hover:bg-white/5 px-2 py-2 text-xs font-semibold flex flex-col items-center gap-1"
                      >
                        <span className="text-base leading-none">⚑</span>
                        <span>Clans</span>
                      </Link>
                      <Link
                        href="/market"
                        onClick={() => setAuthOpen(false)}
                        className="rounded-lg border border-white/10 bg-black/30 hover:bg-white/5 px-2 py-2 text-xs font-semibold flex flex-col items-center gap-1"
                      >
                        <span className="text-base leading-none">🛒</span>
                        <span>Market</span>
                      </Link>
                      <button
                        onClick={() => {
                          setAuthOpen(false);
                          setGuideOpen(true);
                        }}
                        className="rounded-lg border border-white/10 bg-black/30 hover:bg-white/5 px-2 py-2 text-xs font-semibold flex flex-col items-center gap-1"
                      >
                        <span className="text-base leading-none">📖</span>
                        <span>Guide</span>
                      </button>
                      <a
                        href="https://t.me/battleshipNfactorial"
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => setAuthOpen(false)}
                        className="rounded-lg px-2 py-2 text-xs font-semibold flex flex-col items-center gap-1"
                        style={{
                          color: "#2AABEE",
                          border: "1px solid rgba(42,171,238,0.5)",
                          background: "rgba(42,171,238,0.10)",
                        }}
                      >
                        <span className="text-base leading-none">✈</span>
                        <span>Telegram</span>
                      </a>
                      <button
                        onClick={toggle}
                        className="rounded-lg border border-white/10 bg-black/30 hover:bg-white/5 px-2 py-2 text-xs font-semibold flex flex-col items-center gap-1"
                        aria-label="Toggle theme"
                      >
                        <span className="text-base leading-none">{theme === "dark" ? "☾" : "☀"}</span>
                        <span>{theme === "dark" ? "Dark" : "Light"}</span>
                      </button>
                      <button
                        onClick={() => {
                          setAuthOpen(false);
                          onUpgrade();
                        }}
                        suppressHydrationWarning
                        className="neon-btn rounded-lg px-2 py-2 text-xs font-semibold flex flex-col items-center gap-1"
                      >
                        <span className="text-base leading-none">✦</span>
                        <span>{profile.pro ? "Pro" : "Upgrade"}</span>
                      </button>
                    </div>
                  </div>

                  {/* Arsenal summary */}
                  {(() => {
                    const inv = mounted ? readInventory(profile) : [];
                    const total = inv.reduce((a, e) => a + e.count, 0);
                    if (!total) return null;
                    return (
                      <div className="mt-3 rounded-lg border border-white/10 bg-black/30 p-3">
                        <div className="text-[10px] uppercase tracking-[0.3em] text-fg-dim">
                          ⚡ Arsenal
                        </div>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {inv.map((e) => {
                            const def = POWER_DEFS[e.type as keyof typeof POWER_DEFS];
                            if (!def) return null;
                            return (
                              <span
                                key={e.type}
                                className="rounded-md border border-white/10 bg-black/30 px-2 py-1 text-[11px] flex items-center gap-1"
                                style={{ color: def.color }}
                                title={def.name}
                              >
                                <span>{def.icon}</span>
                                <span className="font-bold tabular-nums">×{e.count}</span>
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Referrals */}
                  <div className="mt-3 rounded-lg border border-white/10 bg-black/30 p-3">
                    <div className="text-[10px] uppercase tracking-[0.3em] text-fg-dim">
                      Invite friends
                    </div>
                    <div className="text-xs text-fg-dim mt-1">
                      Both get +50 ⚓ when they sign up.
                    </div>
                    <div className="flex gap-2 mt-2">
                      <input
                        readOnly
                        value={inviteUrl}
                        onClick={(e) => (e.target as HTMLInputElement).select()}
                        className="flex-1 rounded-md bg-black/40 border border-white/10 px-2 py-1 text-[11px] font-mono"
                      />
                      <button
                        onClick={copyInvite}
                        className="neon-btn rounded-md px-2 py-1 text-[11px] font-semibold whitespace-nowrap"
                      >
                        {linkCopied ? "Copied!" : "Copy"}
                      </button>
                    </div>
                    {signedIn && (
                      <div className="text-[11px] text-fg-dim mt-2">
                        {referralStats.count} invited · +{referralStats.coinsEarned} ⚓ earned
                      </div>
                    )}
                  </div>

                  {!signedIn && profile.isGuest && cloudEnabled && (
                    <div className="text-[11px] text-fg-dim mt-3 leading-relaxed">
                      Stats saved on this device. Sign in to sync coins, levels, and the global leaderboard.
                    </div>
                  )}

                  {!signedIn && cloudEnabled && (
                    <button
                      onClick={() => {
                        setAuthOpen(false);
                        router.push("/auth");
                      }}
                      className="mt-3 w-full neon-btn rounded-lg px-3 py-2 text-sm font-semibold"
                    >
                      {profile.isGuest ? "Sign in to sync" : "Sign in with callsign"}
                    </button>
                  )}

                  {!cloudEnabled && (
                    <p className="text-[11px] text-fg-dim mt-2">
                      Cloud sync is off. Add <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to enable global leaderboard.
                    </p>
                  )}

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setEditingProfile(true)}
                      className="rounded-lg border border-white/15 hover:bg-white/5 px-3 py-2 text-sm"
                    >
                      Edit profile
                    </button>
                    {signedIn && (
                      <button
                        onClick={async () => {
                          await signOut();
                        }}
                        className="rounded-lg border border-white/15 hover:bg-white/5 px-3 py-2 text-sm"
                      >
                        Sign out
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex flex-col gap-2">
                  <label className="text-xs uppercase tracking-[0.2em] text-fg-dim">Captain name</label>
                  <input
                    value={profile.username}
                    onChange={(e) => setProfile({ ...profile, username: e.target.value })}
                    className="rounded-lg bg-black/30 border border-white/15 px-3 py-2 text-sm"
                  />
                  <label className="text-xs uppercase tracking-[0.2em] text-fg-dim">City</label>
                  <input
                    value={profile.city}
                    onChange={(e) => setProfile({ ...profile, city: e.target.value })}
                    className="rounded-lg bg-black/30 border border-white/15 px-3 py-2 text-sm"
                  />
                  <button
                    onClick={() => setEditingProfile(false)}
                    className="neon-btn rounded-lg px-3 py-2 text-sm font-semibold mt-1"
                  >
                    Save
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </div>
      </div>
      <HowToPlay open={guideOpen} onClose={() => setGuideOpen(false)} />
    </header>
  );
}
