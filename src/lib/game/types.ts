export const BOARD_SIZE = 10;

export type Orientation = "H" | "V";

export type ShipType = "carrier" | "battleship" | "cruiser" | "submarine" | "destroyer";

export interface ShipDef {
  type: ShipType;
  name: string;
  length: number;
}

export const SHIP_DEFS: ShipDef[] = [
  { type: "carrier", name: "Carrier", length: 5 },
  { type: "battleship", name: "Battleship", length: 4 },
  { type: "cruiser", name: "Cruiser", length: 3 },
  { type: "submarine", name: "Submarine", length: 3 },
  { type: "destroyer", name: "Destroyer", length: 2 },
];

export interface Ship {
  id: string;
  type: ShipType;
  length: number;
  row: number;
  col: number;
  orientation: Orientation;
  hits: number;
  sunk: boolean;
  // Optional custom-ship metadata (rendered on the board for the
  // captain's signature vessel — see /workshop).
  customName?: string;
  customSkin?: string; // gradient css value
  customBadge?: string;
}

export type CellState = "empty" | "ship" | "miss" | "hit" | "sunk";

export interface Board {
  ships: Ship[];
  shots: Map<string, CellState>; // key "r,c" -> miss/hit/sunk
}

export type Difficulty = "easy" | "medium" | "hard";
export type Mode = "classic" | "blitz";

export interface PlayerStats {
  wins: number;
  losses: number;
  shotsFired: number;
  shotsHit: number;
  gamesPlayed: number;
}

export interface GameRecord {
  id: string;
  date: number;
  result: "win" | "loss";
  difficulty: Difficulty;
  mode: Mode;
  shotsFired: number;
  shotsHit: number;
  durationMs: number;
}

export const cellKey = (r: number, c: number) => `${r},${c}`;

export function inBounds(r: number, c: number): boolean {
  return r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE;
}

export function shipCells(ship: Pick<Ship, "row" | "col" | "length" | "orientation">): Array<[number, number]> {
  const cells: Array<[number, number]> = [];
  for (let i = 0; i < ship.length; i++) {
    const r = ship.orientation === "V" ? ship.row + i : ship.row;
    const c = ship.orientation === "H" ? ship.col + i : ship.col;
    cells.push([r, c]);
  }
  return cells;
}
