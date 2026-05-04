"use client";

import { GameRecord, PlayerStats } from "./game/types";
import { getSupabase, supabaseEnabled } from "./supabase/client";

const HISTORY_KEY = "bs.history";
const STATS_KEY = "bs.stats";
const LEADERBOARD_KEY = "bs.leaderboard";
const PROFILE_KEY = "bs.profile";

export interface LocalProfile {
  username: string;
  city: string;
  pro: boolean;
  shipSkin: string;
  isGuest?: boolean;
}

export interface LeaderboardEntry {
  username: string;
  city: string;
  wins: number;
  accuracy: number;
  rating: number;
  updatedAt: number;
}

export const defaultStats = (): PlayerStats => ({
  wins: 0,
  losses: 0,
  shotsFired: 0,
  shotsHit: 0,
  gamesPlayed: 0,
});

const isBrowser = () => typeof window !== "undefined";

export function loadProfile(): LocalProfile {
  if (!isBrowser()) return { username: "Captain", city: "Unknown", pro: false, shipSkin: "default" };
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return { username: "Captain", city: "Unknown", pro: false, shipSkin: "default" };
    return JSON.parse(raw);
  } catch {
    return { username: "Captain", city: "Unknown", pro: false, shipSkin: "default" };
  }
}

export function saveProfile(profile: LocalProfile) {
  if (!isBrowser()) return;
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
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
  // Simple Elo-like rating for the local leaderboard
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
  // Replace by username
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

// Optional cloud sync (no-op when not configured or when running as guest)
export async function syncCloudLeaderboard(profile: LocalProfile, stats: PlayerStats) {
  if (!supabaseEnabled()) return;
  if (profile.isGuest) return;
  const sb = getSupabase();
  if (!sb) return;
  // Only sync to the cloud leaderboard when there's an authenticated session —
  // RLS will reject anonymous writes and we don't want to surface noise.
  const { data: userData } = await sb.auth.getUser();
  if (!userData.user) return;
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
