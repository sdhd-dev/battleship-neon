"use client";

import {
  LocalProfile,
  loadProfile,
  saveProfile,
  syncCloudProfile,
} from "./storage";
import {
  Reward,
  RewardContext,
  calcWinReward,
  levelForXp,
} from "./progression";
import { getSupabase, supabaseEnabled } from "./supabase/client";

const PVP_PAYOUTS_KEY = "bs.pvp.payouts";
const LEVEL_UP_EVENT = "bs:levelup";
const COIN_GAIN_EVENT = "bs:coingain";

// ── Daily-first-win detection (local time) ────────────────────
function localDay(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function isDailyFirstWin(profile: LocalProfile): boolean {
  if (!profile.lastDailyWinAt) return true;
  return localDay(new Date(profile.lastDailyWinAt)) !== localDay();
}

// ── Apply a win reward ────────────────────────────────────────
export interface ApplyRewardResult {
  reward: Reward;
  profile: LocalProfile;
  leveledUp: boolean;
  oldLevel: number;
  newLevel: number;
}

export function applyWinReward(
  ctx: Omit<RewardContext, "dailyFirstWin">
): ApplyRewardResult {
  const profile = loadProfile();
  const dailyFirstWin = isDailyFirstWin(profile);
  const reward = calcWinReward({ ...ctx, dailyFirstWin });
  const oldXp = profile.xp ?? 0;
  const oldLevel = profile.level ?? levelForXp(oldXp);
  const newXp = oldXp + reward.xp;
  const newLevel = levelForXp(newXp);
  const next: LocalProfile = {
    ...profile,
    coins: (profile.coins ?? 0) + reward.totalCoins,
    xp: newXp,
    level: newLevel,
    lastDailyWinAt: Date.now(),
  };
  saveProfile(next);
  void syncCloudProfile(next);

  emitCoinGain(reward.totalCoins);
  const leveledUp = newLevel > oldLevel;
  if (leveledUp) emitLevelUp(newLevel);

  return { reward, profile: next, leveledUp, oldLevel, newLevel };
}

// ── PvP farming cap (1 reward per opponent per UTC day) ───────
type PvpLog = Record<string, string>; // opponent (lowercased) -> "YYYY-MM-DD" UTC

function loadPvpLog(): PvpLog {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(PVP_PAYOUTS_KEY) || "{}") as PvpLog;
  } catch {
    return {};
  }
}
function savePvpLog(log: PvpLog) {
  if (typeof window === "undefined") return;
  localStorage.setItem(PVP_PAYOUTS_KEY, JSON.stringify(log));
}
function utcDay(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export async function pvpRewardEligible(
  opponentUsername: string
): Promise<boolean> {
  const opp = opponentUsername.trim().toLowerCase();
  if (!opp) return false;
  const log = loadPvpLog();
  const today = utcDay();
  if (log[opp] === today) return false;

  if (!supabaseEnabled()) return true;
  const sb = getSupabase();
  if (!sb) return true;
  const me = (loadProfile().username || "").toLowerCase();
  if (!me) return true;
  const { data } = await sb
    .from("pvp_payouts")
    .select("day")
    .eq("payer_username", me)
    .eq("opponent_username", opp)
    .eq("day", today)
    .maybeSingle();
  return !data;
}

export async function recordPvpPayout(opponentUsername: string) {
  const opp = opponentUsername.trim().toLowerCase();
  if (!opp) return;
  const log = loadPvpLog();
  const today = utcDay();
  log[opp] = today;
  savePvpLog(log);

  if (!supabaseEnabled()) return;
  const sb = getSupabase();
  if (!sb) return;
  const me = (loadProfile().username || "").toLowerCase();
  if (!me) return;
  await sb
    .from("pvp_payouts")
    .insert({ payer_username: me, opponent_username: opp, day: today })
    .then(() => undefined, () => undefined);
}

// ── Spend coins (shop) ────────────────────────────────────────
export function spendCoins(amount: number): {
  ok: boolean;
  profile: LocalProfile;
} {
  const profile = loadProfile();
  if ((profile.coins ?? 0) < amount) return { ok: false, profile };
  const next: LocalProfile = {
    ...profile,
    coins: (profile.coins ?? 0) - amount,
  };
  saveProfile(next);
  void syncCloudProfile(next);
  return { ok: true, profile: next };
}

export function grantCoins(amount: number, reason?: string): LocalProfile {
  const profile = loadProfile();
  const next: LocalProfile = {
    ...profile,
    coins: (profile.coins ?? 0) + amount,
  };
  saveProfile(next);
  void syncCloudProfile(next);
  if (amount > 0) emitCoinGain(amount, reason);
  return next;
}

// ── Event bus ─────────────────────────────────────────────────
export function emitLevelUp(newLevel: number) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(LEVEL_UP_EVENT, { detail: { level: newLevel } })
  );
}
export function onLevelUp(handler: (level: number) => void) {
  if (typeof window === "undefined") return () => {};
  const wrap = (e: Event) =>
    handler((e as CustomEvent<{ level: number }>).detail.level);
  window.addEventListener(LEVEL_UP_EVENT, wrap);
  return () => window.removeEventListener(LEVEL_UP_EVENT, wrap);
}

export function emitCoinGain(amount: number, reason?: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(COIN_GAIN_EVENT, { detail: { amount, reason } })
  );
}
export function onCoinGain(
  handler: (amount: number, reason?: string) => void
) {
  if (typeof window === "undefined") return () => {};
  const wrap = (e: Event) => {
    const d = (e as CustomEvent<{ amount: number; reason?: string }>).detail;
    handler(d.amount, d.reason);
  };
  window.addEventListener(COIN_GAIN_EVENT, wrap);
  return () => window.removeEventListener(COIN_GAIN_EVENT, wrap);
}
