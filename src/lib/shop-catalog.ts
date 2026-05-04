// Static shop catalog. IDs are stable — they're persisted in
// `LocalProfile.ownedCosmetics` and the cloud `profiles.owned_cosmetics` array.

export type CosmeticKind = "skin" | "theme" | "badge";

export interface SkinItem {
  id: string;
  kind: "skin";
  name: string;
  price: number;
  gradient: string;
}

export interface ThemeItem {
  id: string;
  kind: "theme";
  name: string;
  price: number;
  vars: Record<string, string>;
  swatch: string;
}

export interface BadgeItem {
  id: string;
  kind: "badge";
  name: string;
  price: number;
  emoji: string;
}

export type ShopItem = SkinItem | ThemeItem | BadgeItem;

export const SKIN_DEFAULT_ID = "default";
export const THEME_DEFAULT_ID = "default";
export const PRO_PRICE = 500;

export const SHIP_SKINS: SkinItem[] = [
  { id: "default", kind: "skin", name: "Standard Hull", price: 0, gradient: "linear-gradient(135deg,#00f0ff,#7c5cff)" },
  { id: "neon", kind: "skin", name: "Neon Drift", price: 50, gradient: "linear-gradient(135deg,#ff2bd6,#7c5cff)" },
  { id: "phantom", kind: "skin", name: "Phantom Steel", price: 75, gradient: "linear-gradient(135deg,#1a1f3a,#3b4279)" },
  { id: "nebula", kind: "skin", name: "Nebula Veil", price: 120, gradient: "linear-gradient(135deg,#5b21b6,#ff2bd6,#00f0ff)" },
  { id: "solar", kind: "skin", name: "Solar Flare", price: 150, gradient: "linear-gradient(135deg,#fbbf24,#ef4444,#7c2d12)" },
  { id: "abyss", kind: "skin", name: "Abyss Mirror", price: 200, gradient: "linear-gradient(135deg,#020617,#0ea5e9,#020617)" },
];

export const BOARD_THEMES: ThemeItem[] = [
  {
    id: "default",
    kind: "theme",
    name: "Cyber Indigo",
    price: 0,
    swatch: "linear-gradient(135deg,#00f0ff,#7c5cff,#ff2bd6)",
    vars: {},
  },
  {
    id: "ember",
    kind: "theme",
    name: "Ember Forge",
    price: 100,
    swatch: "linear-gradient(135deg,#ff7a00,#ef4444,#7c2d12)",
    vars: {
      "--accent": "#ff7a00",
      "--accent-2": "#ef4444",
      "--accent-3": "#fbbf24",
    },
  },
  {
    id: "frost",
    kind: "theme",
    name: "Frost Tide",
    price: 100,
    swatch: "linear-gradient(135deg,#7dd3fc,#a78bfa,#38bdf8)",
    vars: {
      "--accent": "#7dd3fc",
      "--accent-2": "#a78bfa",
      "--accent-3": "#38bdf8",
    },
  },
  {
    id: "toxic",
    kind: "theme",
    name: "Toxic Wake",
    price: 100,
    swatch: "linear-gradient(135deg,#84cc16,#22d3ee,#a3e635)",
    vars: {
      "--accent": "#84cc16",
      "--accent-2": "#22d3ee",
      "--accent-3": "#a3e635",
    },
  },
];

export const PROFILE_BADGES: BadgeItem[] = [
  { id: "champ", kind: "badge", name: "Champion", price: 75, emoji: "🥇" },
  { id: "veteran", kind: "badge", name: "Veteran", price: 75, emoji: "⚓" },
  { id: "streak", kind: "badge", name: "Hot Streak", price: 75, emoji: "🔥" },
  { id: "defender", kind: "badge", name: "Defender", price: 75, emoji: "🛡" },
];

export function findItem(id: string): ShopItem | undefined {
  return (
    SHIP_SKINS.find((i) => i.id === id) ??
    BOARD_THEMES.find((i) => i.id === id) ??
    PROFILE_BADGES.find((i) => i.id === id)
  );
}

export function getThemeVars(id?: string): Record<string, string> {
  const t = BOARD_THEMES.find((b) => b.id === id) ?? BOARD_THEMES[0];
  return t.vars;
}
