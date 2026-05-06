import { addPower } from "./powers";
import { CustomShip, CustomShipPower, LocalProfile } from "./storage";
import { Orientation, Ship, ShipType } from "./game/types";

export const MAX_SHIP_POWERS = 3;
export const FREE_POWER_SLOTS = 1;

export type ShipKind = CustomShip["type"];

export interface ShipKindDef {
  id: ShipKind;
  name: string;
  length: number;
  premium: boolean;
  desc: string;
}

export const SHIP_KIND_DEFS: ShipKindDef[] = [
  {
    id: "destroyer",
    name: "Destroyer",
    length: 2,
    premium: false,
    desc: "Compact and quick. Free for all captains.",
  },
  {
    id: "submarine",
    name: "Submarine",
    length: 3,
    premium: true,
    desc: "Stealth class. Premium ship — supports the creator.",
  },
  {
    id: "cruiser",
    name: "Cruiser",
    length: 3,
    premium: true,
    desc: "Balanced firepower. Premium ship.",
  },
  {
    id: "battleship",
    name: "Battleship",
    length: 4,
    premium: true,
    desc: "Heavy cannon. Premium ship.",
  },
  {
    id: "carrier",
    name: "Carrier",
    length: 5,
    premium: true,
    desc: "Flagship of the fleet. Premium ship.",
  },
];

export interface SkinDef {
  id: string;
  name: string;
  premium: boolean;
  gradient: string;
  glow: string;
}

export const WORKSHOP_SKINS: SkinDef[] = [
  {
    id: "cyber-blue",
    name: "Cyber Blue",
    premium: false,
    gradient: "linear-gradient(135deg, #22d3ee, #1e3a8a)",
    glow: "#22d3ee",
  },
  {
    id: "neon-pink",
    name: "Neon Pink",
    premium: false,
    gradient: "linear-gradient(135deg, #ff2bd6, #6b21a8)",
    glow: "#ff2bd6",
  },
  {
    id: "shadow-black",
    name: "Shadow Black",
    premium: false,
    gradient: "linear-gradient(135deg, #1f2937, #0a0a0a)",
    glow: "#9ca3af",
  },
  {
    id: "arctic-white",
    name: "Arctic White",
    premium: false,
    gradient: "linear-gradient(135deg, #ffffff, #cbd5e1)",
    glow: "#e0f2fe",
  },
  {
    id: "lava-red",
    name: "Lava Red",
    premium: false,
    gradient: "linear-gradient(135deg, #f97316, #b91c1c)",
    glow: "#f97316",
  },
  {
    id: "forest-green",
    name: "Forest Green",
    premium: false,
    gradient: "linear-gradient(135deg, #34d399, #064e3b)",
    glow: "#34d399",
  },
  {
    id: "gold-titan",
    name: "Gold Titan",
    premium: true,
    gradient: "linear-gradient(135deg, #fbbf24, #b45309)",
    glow: "#fbbf24",
  },
  {
    id: "diamond-crystal",
    name: "Diamond Crystal",
    premium: true,
    gradient:
      "linear-gradient(135deg, #a5f3fc, #818cf8 50%, #f0abfc)",
    glow: "#a5f3fc",
  },
  {
    id: "rainbow-storm",
    name: "Rainbow Storm",
    premium: true,
    gradient:
      "linear-gradient(135deg, #f87171, #fbbf24, #34d399, #22d3ee, #a78bfa, #ff2bd6)",
    glow: "#ff2bd6",
  },
];

export const WORKSHOP_BADGES = [
  "⚓",
  "🔥",
  "⚡",
  "💀",
  "🎯",
  "🛡️",
  "🌊",
  "🦈",
  "☠️",
  "🚀",
];

export const WORKSHOP_POWERS: CustomShipPower[] = [
  "radar",
  "airstrike",
  "precision",
  "shield",
  "smokescreen",
];

export function findShipKind(id: ShipKind): ShipKindDef {
  return SHIP_KIND_DEFS.find((d) => d.id === id) ?? SHIP_KIND_DEFS[0];
}

export function findSkin(id: string): SkinDef {
  return WORKSHOP_SKINS.find((s) => s.id === id) ?? WORKSHOP_SKINS[0];
}

const NAME_RE = /^[A-Za-z0-9 ]+$/;

export function validateShipName(raw: string): { ok: boolean; msg?: string } {
  const name = raw.trim();
  if (name.length < 1) return { ok: false, msg: "Name required." };
  if (name.length > 12) return { ok: false, msg: "Max 12 characters." };
  if (!NAME_RE.test(name))
    return { ok: false, msg: "Letters, numbers and spaces only." };
  return { ok: true };
}

// Tag the ship matching the player's custom ship type with custom name,
// skin gradient, and badge. Returns a new fleet array.
export function applyCustomShip(ships: Ship[], custom: CustomShip | null | undefined): Ship[] {
  if (!custom) return ships;
  const skinDef = findSkin(custom.skin);
  let applied = false;
  return ships.map((s) => {
    if (applied || s.type !== custom.type) return s;
    applied = true;
    return {
      ...s,
      customName: custom.name,
      customSkin: skinDef.gradient,
      customBadge: custom.badge,
    };
  });
}

// Award the custom-ship superpowers at game start. Each entry in
// customShip.powers grants +1 of that power.
export function grantCustomShipPower(profile: LocalProfile): void {
  if (!profile.customShip) return;
  for (const p of profile.customShip.powers) {
    addPower(p, 1);
  }
}

// Reconstruct a sunk Ship from its cell list — used in online modes when
// a sunk-result broadcast arrives and we want to render the rival's
// custom skin/badge on the attacker's view of the enemy board.
export function synthesizeSunkShip(
  cells: Array<[number, number]>,
  type: ShipType | undefined,
  meta: {
    customName?: string;
    customSkin?: string;
    customBadge?: string;
  } = {}
): Ship | null {
  if (!cells || cells.length === 0) return null;
  const rows = cells.map(([r]) => r);
  const cols = cells.map(([, c]) => c);
  const minR = Math.min(...rows);
  const minC = Math.min(...cols);
  const orientation: Orientation =
    rows.every((r) => r === rows[0]) ? "H" : "V";
  return {
    id: `enemy_${minR}_${minC}_${cells.length}`,
    type: type ?? "destroyer",
    length: cells.length,
    row: minR,
    col: minC,
    orientation,
    hits: cells.length,
    sunk: true,
    customName: meta.customName,
    customSkin: meta.customSkin,
    customBadge: meta.customBadge,
  };
}
