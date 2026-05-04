// Levels, XP curve, titles, and reward calculator.
// Pure module — no side effects, safe to import anywhere.

export const MAX_LEVEL = 100;

const BASE_XP = 100;
const GROWTH = 1.18;

const _levelTotals: number[] = (() => {
  const t = [0, 0];
  let acc = 0;
  for (let i = 1; i < MAX_LEVEL; i++) {
    acc += Math.round(BASE_XP * Math.pow(GROWTH, i - 1));
    t[i + 1] = acc;
  }
  return t;
})();

export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  if (level >= MAX_LEVEL) return _levelTotals[MAX_LEVEL];
  return _levelTotals[level];
}

export function levelForXp(xp: number): number {
  if (xp <= 0) return 1;
  // Binary search the cumulative table.
  let lo = 1, hi = MAX_LEVEL;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (_levelTotals[mid] <= xp) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

export function titleForLevel(level: number): string {
  if (level <= 10) return "Recruit";
  if (level <= 20) return "Cadet";
  if (level <= 35) return "Officer";
  if (level <= 50) return "Commander";
  if (level <= 70) return "Captain";
  if (level <= 85) return "Admiral";
  return "Legend";
}

// 0..1 progress within the current level.
export function progressInLevel(xp: number, level: number) {
  if (level >= MAX_LEVEL) return 1;
  const cur = xpForLevel(level);
  const next = xpForLevel(level + 1);
  if (next <= cur) return 1;
  return Math.max(0, Math.min(1, (xp - cur) / (next - cur)));
}

export function xpToNext(xp: number, level: number): number {
  if (level >= MAX_LEVEL) return 0;
  return Math.max(0, xpForLevel(level + 1) - xp);
}

export type Difficulty = "easy" | "medium" | "hard";
export type Mode = "classic" | "blitz";

export interface RewardContext {
  difficulty?: Difficulty; // omitted for PvP
  mode: Mode;
  perfect: boolean;
  dailyFirstWin: boolean;
  isPvp?: boolean;
}

export interface Reward {
  baseCoins: number;
  bonusCoins: number;
  totalCoins: number;
  xp: number;
  breakdown: Array<{ label: string; coins: number }>;
}

export function calcWinReward(ctx: RewardContext): Reward {
  const breakdown: Array<{ label: string; coins: number }> = [];
  let base = 0;
  if (ctx.isPvp) {
    base = 25;
    breakdown.push({ label: "PvP win", coins: 25 });
  } else if (ctx.difficulty === "easy") {
    base = 10;
    breakdown.push({ label: "Win vs Cadet", coins: 10 });
  } else if (ctx.difficulty === "medium") {
    base = 25;
    breakdown.push({ label: "Win vs Officer", coins: 25 });
  } else if (ctx.difficulty === "hard") {
    base = 50;
    breakdown.push({ label: "Win vs Admiral", coins: 50 });
  }

  let bonus = 0;
  if (ctx.mode === "blitz") {
    bonus += 30;
    breakdown.push({ label: "Blitz bonus", coins: 30 });
  }
  if (ctx.perfect) {
    bonus += 20;
    breakdown.push({ label: "Perfect game", coins: 20 });
  }
  if (ctx.dailyFirstWin) {
    bonus += 15;
    breakdown.push({ label: "Daily first win", coins: 15 });
  }

  const totalCoins = base + bonus;
  return { baseCoins: base, bonusCoins: bonus, totalCoins, xp: totalCoins, breakdown };
}
