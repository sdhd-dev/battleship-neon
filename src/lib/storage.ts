"use client";

import { GameRecord, PlayerStats } from "./game/types";
import { getSupabase, supabaseEnabled } from "./supabase/client";
import { levelForXp } from "./progression";
import { weekStartIso } from "./tournament";

const HISTORY_KEY = "bs.history";
const STATS_KEY = "bs.stats";
const LEADERBOARD_KEY = "bs.leaderboard";
const PROFILE_KEY = "bs.profile";
const WEEKLY_KEY = "bs.weekly";

export interface LocalProfile {
  username: string;
  city: string;
  pro: boolean;
  shipSkin: string;
  isGuest?: boolean;

  // ── economy ──
  coins?: number;
  xp?: number;
  level?: number;
  lastDailyWinAt?: number;

  // ── cosmetics ──
  ownedCosmetics?: string[]; // skin/theme/badge IDs purchased via the shop
  activeBoardTheme?: string;
  activeBadge?: string;

  // ── referrals ──
  referredBy?: string; // username of the inviter, set once on signup
}

export interface LeaderboardEntry {
  username: string;
  city: string;
  wins: number;
  accuracy: number;
  rating: number;
  updatedAt: number;
}

export interface WeeklyStats {
  weekStart: string; // YYYY-MM-DD UTC
  wins: number;
  shotsFired: number;
  shotsHit: number;
}

export interface WeeklyLeaderboardEntry extends LeaderboardEntry {
  weekStart: string;
}

const DEFAULT_PROFILE: LocalProfile = {
  username: "Captain",
  city: "Unknown",
  pro: false,
  shipSkin: "default",
  coins: 0,
  xp: 0,
  level: 1,
  ownedCosmetics: [],
  activeBoardTheme: "default",
};

export const defaultStats = (): PlayerStats => ({
  wins: 0,
  losses: 0,
  shotsFired: 0,
  shotsHit: 0,
  gamesPlayed: 0,
});

const isBrowser = () => typeof window !== "undefined";

function backfillProfile(p: Partial<LocalProfile>): LocalProfile {
  const xp = p.xp ?? 0;
  return {
    ...DEFAULT_PROFILE,
    ...p,
    coins: p.coins ?? 0,
    xp,
    level: p.level ?? levelForXp(xp),
    ownedCosmetics: p.ownedCosmetics ?? [],
    activeBoardTheme: p.activeBoardTheme ?? "default",
  } as LocalProfile;
}

export function loadProfile(): LocalProfile {
  if (!isBrowser()) return { ...DEFAULT_PROFILE };
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return { ...DEFAULT_PROFILE };
    return backfillProfile(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_PROFILE };
  }
}

export const PROFILE_CHANGE_EVENT = "bs:profilechange";

export function saveProfile(profile: LocalProfile) {
  if (!isBrowser()) return;
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  window.dispatchEvent(new CustomEvent(PROFILE_CHANGE_EVENT));
}

export function loadStats(): PlayerStats {
  if (!isBrowser()) return defaultStats();
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (!raw) return defaultStats();
    return { ...defaultStats(), ...JSON.parse(raw) };
  } catch {
    return defaultStats();
  }
}

export function saveStats(stats: PlayerStats) {
  if (!isBrowser()) return;
  localStorage.setItem(STATS_KEY, JSON.stringify(stats));
}

export function loadHistory(): GameRecord[] {
  if (!isBrowser()) return [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveHistory(history: GameRecord[]) {
  if (!isBrowser()) return;
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 50)));
}

export function deleteHistoryEntry(id: string): GameRecord[] {
  const next = loadHistory().filter((g) => g.id !== id);
  saveHistory(next);
  return next;
}

export function clearHistory() {
  if (!isBrowser()) return;
  localStorage.removeItem(HISTORY_KEY);
  localStorage.removeItem(STATS_KEY);
  localStorage.removeItem(LEADERBOARD_KEY);
  localStorage.removeItem(WEEKLY_KEY);
}

export function recordGame(stats: PlayerStats, record: GameRecord): { stats: PlayerStats; history: GameRecord[] } {
  const newStats: PlayerStats = {
    wins: stats.wins + (record.result === "win" ? 1 : 0),
    losses: stats.losses + (record.result === "loss" ? 1 : 0),
    shotsFired: stats.shotsFired + record.shotsFired,
    shotsHit: stats.shotsHit + record.shotsHit,
    gamesPlayed: stats.gamesPlayed + 1,
  };
  const history = [record, ...loadHistory()].slice(0, 50);
  saveStats(newStats);
  saveHistory(history);
  return { stats: newStats, history };
}

function computeRating(wins: number, accuracy: number) {
  return Math.round(1000 + wins * 30 + accuracy * 400);
}

export function recordLocalLeaderboard(profile: LocalProfile, stats: PlayerStats) {
  if (!isBrowser()) return;
  const accuracy = stats.shotsFired ? stats.shotsHit / stats.shotsFired : 0;
  const entry: LeaderboardEntry = {
    username: profile.username || "Captain",
    city: profile.city || "Unknown",
    wins: stats.wins,
    accuracy,
    rating: computeRating(stats.wins, accuracy),
    updatedAt: Date.now(),
  };
  const raw = localStorage.getItem(LEADERBOARD_KEY);
  let list: LeaderboardEntry[] = [];
  try {
    list = raw ? JSON.parse(raw) : [];
  } catch {
    list = [];
  }
  list = list.filter((e) => e.username.toLowerCase() !== entry.username.toLowerCase());
  list.push(entry);
  list.sort((a, b) => b.rating - a.rating);
  localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(list.slice(0, 200)));
}

export function loadLocalLeaderboard(): LeaderboardEntry[] {
  if (!isBrowser()) return [];
  try {
    const raw = localStorage.getItem(LEADERBOARD_KEY);
    const local: LeaderboardEntry[] = raw ? JSON.parse(raw) : [];
    local.sort((a, b) => b.rating - a.rating);
    return local;
  } catch {
    return [];
  }
}

// ── Weekly tracking ──────────────────────────────────────────
export function loadWeeklyStats(): WeeklyStats {
  const week = weekStartIso();
  const empty: WeeklyStats = { weekStart: week, wins: 0, shotsFired: 0, shotsHit: 0 };
  if (!isBrowser()) return empty;
  try {
    const raw = localStorage.getItem(WEEKLY_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as WeeklyStats;
    if (parsed.weekStart !== week) return empty; // implicit reset
    return { ...empty, ...parsed };
  } catch {
    return empty;
  }
}

export function recordWeeklyGame(record: GameRecord): WeeklyStats {
  const cur = loadWeeklyStats();
  const next: WeeklyStats = {
    weekStart: cur.weekStart,
    wins: cur.wins + (record.result === "win" ? 1 : 0),
    shotsFired: cur.shotsFired + record.shotsFired,
    shotsHit: cur.shotsHit + record.shotsHit,
  };
  if (isBrowser()) localStorage.setItem(WEEKLY_KEY, JSON.stringify(next));
  return next;
}

// ── Cloud sync ───────────────────────────────────────────────
async function authedUserId(): Promise<string | null> {
  if (!supabaseEnabled()) return null;
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getUser();
  return data.user?.id ?? null;
}

export async function syncCloudLeaderboard(profile: LocalProfile, stats: PlayerStats) {
  if (!supabaseEnabled()) return;
  if (profile.isGuest) return;
  const sb = getSupabase();
  if (!sb) return;
  const uid = await authedUserId();
  if (!uid) return;
  const accuracy = stats.shotsFired ? stats.shotsHit / stats.shotsFired : 0;
  await sb.from("leaderboard").upsert({
    username: profile.username,
    city: profile.city,
    wins: stats.wins,
    accuracy,
    rating: computeRating(stats.wins, accuracy),
    updated_at: new Date().toISOString(),
  });
}

export async function syncCloudWeeklyLeaderboard(profile: LocalProfile, weekly: WeeklyStats) {
  if (!supabaseEnabled()) return;
  if (profile.isGuest) return;
  const sb = getSupabase();
  if (!sb) return;
  if (!(await authedUserId())) return;
  const accuracy = weekly.shotsFired ? weekly.shotsHit / weekly.shotsFired : 0;
  await sb.from("weekly_leaderboard").upsert(
    {
      username: profile.username,
      city: profile.city,
      week_start: weekly.weekStart,
      wins: weekly.wins,
      accuracy,
      rating: computeRating(weekly.wins, accuracy),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "username,week_start" }
  );
}

export async function syncCloudProfile(profile: LocalProfile) {
  if (!supabaseEnabled()) return;
  if (profile.isGuest) return;
  const sb = getSupabase();
  if (!sb) return;
  const uid = await authedUserId();
  if (!uid) return;
  await sb
    .from("profiles")
    .upsert(
      {
        id: uid,
        username: profile.username,
        username_lc: profile.username?.toLowerCase() ?? null,
        city: profile.city,
        pro: profile.pro,
        ship_skin: profile.shipSkin,
        active_board_theme: profile.activeBoardTheme ?? "default",
        active_badge: profile.activeBadge ?? null,
        owned_cosmetics: profile.ownedCosmetics ?? [],
        coins: profile.coins ?? 0,
        xp: profile.xp ?? 0,
        level: profile.level ?? 1,
        referral_code: profile.username?.toLowerCase() ?? null,
        referred_by: profile.referredBy ?? null,
        last_daily_win_at: profile.lastDailyWinAt
          ? new Date(profile.lastDailyWinAt).toISOString()
          : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    )
    .then(() => undefined, () => undefined);
}

export async function pullCloudProfile(): Promise<Partial<LocalProfile> | null> {
  if (!supabaseEnabled()) return null;
  const sb = getSupabase();
  if (!sb) return null;
  const uid = await authedUserId();
  if (!uid) return null;
  const { data, error } = await sb
    .from("profiles")
    .select(
      "username,city,pro,ship_skin,active_board_theme,active_badge,owned_cosmetics,coins,xp,level,referred_by,last_daily_win_at"
    )
    .eq("id", uid)
    .maybeSingle();
  if (error || !data) return null;
  return {
    username: data.username ?? undefined,
    city: data.city ?? undefined,
    pro: !!data.pro,
    shipSkin: data.ship_skin ?? "default",
    activeBoardTheme: data.active_board_theme ?? "default",
    activeBadge: data.active_badge ?? undefined,
    ownedCosmetics: data.owned_cosmetics ?? [],
    coins: data.coins ?? 0,
    xp: data.xp ?? 0,
    level: data.level ?? 1,
    referredBy: data.referred_by ?? undefined,
    lastDailyWinAt: data.last_daily_win_at
      ? new Date(data.last_daily_win_at).getTime()
      : undefined,
  };
}

export async function fetchCloudLeaderboard(): Promise<LeaderboardEntry[] | null> {
  if (!supabaseEnabled()) return null;
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb
    .from("leaderboard")
    .select("username,city,wins,accuracy,rating,updated_at")
    .order("rating", { ascending: false })
    .limit(50);
  if (error || !data) return null;
  return data.map((d) => ({
    username: d.username,
    city: d.city,
    wins: d.wins,
    accuracy: d.accuracy,
    rating: d.rating,
    updatedAt: new Date(d.updated_at).getTime(),
  }));
}

export async function fetchWeeklyLeaderboard(): Promise<WeeklyLeaderboardEntry[] | null> {
  if (!supabaseEnabled()) return null;
  const sb = getSupabase();
  if (!sb) return null;
  const week = weekStartIso();
  const { data, error } = await sb
    .from("weekly_leaderboard")
    .select("username,city,wins,accuracy,rating,updated_at,week_start")
    .eq("week_start", week)
    .order("rating", { ascending: false })
    .limit(50);
  if (error || !data) return null;
  return data.map((d) => ({
    username: d.username,
    city: d.city,
    wins: d.wins,
    accuracy: d.accuracy,
    rating: d.rating,
    updatedAt: new Date(d.updated_at).getTime(),
    weekStart: d.week_start,
  }));
}
