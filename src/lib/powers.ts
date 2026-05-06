"use client";

import { LocalProfile, loadProfile, saveProfile, syncCloudProfile } from "./storage";

export type PowerType =
  | "precision"
  | "airstrike"
  | "radar"
  | "shield"
  | "smokescreen"
  | "double";

export interface PowerEntry {
  type: PowerType;
  count: number;
}

export interface PowerDef {
  type: PowerType;
  icon: string;
  name: string;
  blurb: string;
  color: string;
}

export const POWER_DEFS: Record<PowerType, PowerDef> = {
  precision: {
    type: "precision",
    icon: "🎯",
    name: "Precision Strike",
    blurb: "Guaranteed hit on a random unrevealed enemy ship cell.",
    color: "#22d3ee",
  },
  airstrike: {
    type: "airstrike",
    icon: "💣",
    name: "Airstrike",
    blurb: "Hit a chosen cell plus 2 cells in a row.",
    color: "#f97316",
  },
  radar: {
    type: "radar",
    icon: "🔍",
    name: "Radar Scan",
    blurb: "Reveal a 2x2 area without firing a shot.",
    color: "#a78bfa",
  },
  shield: {
    type: "shield",
    icon: "🛡️",
    name: "Shield",
    blurb: "Auto-block the next enemy shot.",
    color: "#34d399",
  },
  smokescreen: {
    type: "smokescreen",
    icon: "💨",
    name: "Smokescreen",
    blurb: "Hide a 3x3 zone — enemy shots miss it for 2 turns.",
    color: "#94a3b8",
  },
  double: {
    type: "double",
    icon: "⭐",
    name: "Double Power",
    blurb: "Two copies of a random power.",
    color: "#fbbf24",
  },
};

export function listPowerDefs(): PowerDef[] {
  return [
    POWER_DEFS.precision,
    POWER_DEFS.airstrike,
    POWER_DEFS.radar,
    POWER_DEFS.shield,
    POWER_DEFS.smokescreen,
  ];
}

export function readInventory(profile: LocalProfile): PowerEntry[] {
  const list = Array.isArray(profile.powers) ? profile.powers : [];
  return list.filter((e): e is PowerEntry => !!e && typeof e.type === "string" && typeof e.count === "number");
}

export function getPowerCount(profile: LocalProfile, type: PowerType): number {
  return readInventory(profile).find((e) => e.type === type)?.count ?? 0;
}

function setInventory(profile: LocalProfile, inv: PowerEntry[]): LocalProfile {
  const cleaned = inv.filter((e) => e.count > 0);
  return { ...profile, powers: cleaned };
}

export function addPower(type: PowerType, amount = 1): LocalProfile {
  const profile = loadProfile();
  const inv = readInventory(profile);
  const existing = inv.find((e) => e.type === type);
  let next: PowerEntry[];
  if (existing) {
    next = inv.map((e) => (e.type === type ? { ...e, count: e.count + amount } : e));
  } else {
    next = [...inv, { type, count: amount }];
  }
  const updated = setInventory(profile, next);
  saveProfile(updated);
  void syncCloudProfile(updated);
  return updated;
}

export function consumePower(type: PowerType): { ok: boolean; profile: LocalProfile } {
  const profile = loadProfile();
  const inv = readInventory(profile);
  const existing = inv.find((e) => e.type === type);
  if (!existing || existing.count <= 0) return { ok: false, profile };
  const next = inv
    .map((e) => (e.type === type ? { ...e, count: e.count - 1 } : e))
    .filter((e) => e.count > 0);
  const updated = setInventory(profile, next);
  saveProfile(updated);
  void syncCloudProfile(updated);
  return { ok: true, profile: updated };
}

// ── Secret Word Mode helpers ─────────────────────────────────

// Exactly 10 words. Same list used by the progress tracker so that
// "decoded N/10" stays accurate.
export const SECRET_WORDS = [
  "BATTLE",
  "CANNON",
  "HUNTER",
  "STEALTH",
  "TORPEDO",
  "RADAR",
  "VESSEL",
  "STRIKE",
  "ANCHOR",
  "SHADOW",
] as const;

export const TOTAL_SECRET_WORDS = SECRET_WORDS.length;

export function pickSecretWord(): string {
  return SECRET_WORDS[Math.floor(Math.random() * SECRET_WORDS.length)];
}

export interface RoulettePrize {
  id: string;
  icon: string;
  label: string;
  description: string;
  color: string;
  // Mutually exclusive payouts:
  awardPower?: { type: PowerType; count: number };
  awardCoins?: number;
  // Whether this prize is "rare" / accent visually
  rare?: boolean;
}

export const ROULETTE_PRIZES: RoulettePrize[] = [
  {
    id: "precision",
    icon: "🎯",
    label: "Precision Strike",
    description: "+1 guaranteed hit",
    color: "#22d3ee",
    awardPower: { type: "precision", count: 1 },
  },
  {
    id: "airstrike",
    icon: "💣",
    label: "Airstrike",
    description: "+1 row blast",
    color: "#f97316",
    awardPower: { type: "airstrike", count: 1 },
  },
  {
    id: "radar",
    icon: "🔍",
    label: "Radar Scan",
    description: "+1 2x2 reveal",
    color: "#a78bfa",
    awardPower: { type: "radar", count: 1 },
  },
  {
    id: "shield",
    icon: "🛡️",
    label: "Shield",
    description: "+1 block",
    color: "#34d399",
    awardPower: { type: "shield", count: 1 },
  },
  {
    id: "smokescreen",
    icon: "💨",
    label: "Smokescreen",
    description: "+1 3x3 cloak",
    color: "#94a3b8",
    awardPower: { type: "smokescreen", count: 1 },
  },
  {
    id: "double",
    icon: "⭐",
    label: "Double Power",
    description: "x2 random power",
    color: "#fbbf24",
    awardPower: { type: "double", count: 1 },
    rare: true,
  },
  {
    id: "jackpot",
    icon: "💰",
    label: "Jackpot",
    description: "+200 coins",
    color: "#fde047",
    awardCoins: 200,
    rare: true,
  },
];

export function rollRoulettePrize(): RoulettePrize {
  // Weighted: rare (double, jackpot) ~12% combined.
  const r = Math.random();
  if (r < 0.06) return ROULETTE_PRIZES.find((p) => p.id === "jackpot")!;
  if (r < 0.12) return ROULETTE_PRIZES.find((p) => p.id === "double")!;
  const common = ROULETTE_PRIZES.filter((p) => !p.rare);
  return common[Math.floor(Math.random() * common.length)];
}

export function spinsForWins(secretWordWins: number): number {
  if (secretWordWins >= 10) return 3;
  if (secretWordWins >= 5) return 2;
  return 1;
}

// Apply a roulette prize to the local profile. Returns the resolved
// power awards (so callers can show a clean summary including the case
// where Double Power expanded into 2 copies of a random power).
export interface AppliedAward {
  prize: RoulettePrize;
  powerType?: PowerType;
  powerCount?: number;
  coins?: number;
}

export function applyRoulettePrize(prize: RoulettePrize): AppliedAward {
  if (prize.awardCoins) {
    const profile = loadProfile();
    const next: LocalProfile = {
      ...profile,
      coins: (profile.coins ?? 0) + prize.awardCoins,
    };
    saveProfile(next);
    void syncCloudProfile(next);
    return { prize, coins: prize.awardCoins };
  }
  if (prize.awardPower) {
    if (prize.awardPower.type === "double") {
      const targets: PowerType[] = ["precision", "airstrike", "radar", "shield", "smokescreen"];
      const pick = targets[Math.floor(Math.random() * targets.length)];
      addPower(pick, 2);
      return { prize, powerType: pick, powerCount: 2 };
    }
    addPower(prize.awardPower.type, prize.awardPower.count);
    return { prize, powerType: prize.awardPower.type, powerCount: prize.awardPower.count };
  }
  return { prize };
}

export function bumpSecretWordWins(decodedWord?: string): LocalProfile {
  const profile = loadProfile();
  const prev = Array.isArray(profile.decodedWords) ? profile.decodedWords : [];
  let decodedWords = prev;
  if (decodedWord) {
    const upper = decodedWord.toUpperCase();
    if (
      (SECRET_WORDS as readonly string[]).includes(upper) &&
      !prev.includes(upper)
    ) {
      decodedWords = [...prev, upper];
    }
  }
  const customShipUnlocked =
    profile.customShipUnlocked || decodedWords.length >= TOTAL_SECRET_WORDS;
  const next: LocalProfile = {
    ...profile,
    secretWordWins: (profile.secretWordWins ?? 0) + 1,
    decodedWords,
    customShipUnlocked,
  };
  saveProfile(next);
  void syncCloudProfile(next);
  return next;
}

export function decodedWordsCount(profile: LocalProfile): number {
  const list = Array.isArray(profile.decodedWords) ? profile.decodedWords : [];
  return list.filter((w) => (SECRET_WORDS as readonly string[]).includes(w))
    .length;
}

export type RedeemResult =
  | { ok: true; word: string; alreadyHad: boolean; profile: LocalProfile }
  | { ok: false; reason: "empty" | "unknown" };

// Manually credit a typed secret word to the profile. No win bump — this is
// the "I know the codes" path that lives on the workshop lock screen.
export function redeemSecretWord(input: string): RedeemResult {
  const upper = input.trim().toUpperCase();
  if (!upper) return { ok: false, reason: "empty" };
  if (!(SECRET_WORDS as readonly string[]).includes(upper)) {
    return { ok: false, reason: "unknown" };
  }
  const profile = loadProfile();
  const prev = Array.isArray(profile.decodedWords) ? profile.decodedWords : [];
  const alreadyHad = prev.includes(upper);
  const decodedWords = alreadyHad ? prev : [...prev, upper];
  const customShipUnlocked =
    profile.customShipUnlocked || decodedWords.length >= TOTAL_SECRET_WORDS;
  const next: LocalProfile = {
    ...profile,
    decodedWords,
    customShipUnlocked,
  };
  saveProfile(next);
  void syncCloudProfile(next);
  return { ok: true, word: upper, alreadyHad, profile: next };
}
