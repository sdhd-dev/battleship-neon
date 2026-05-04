import {
  BOARD_SIZE,
  Board,
  CellState,
  Orientation,
  SHIP_DEFS,
  Ship,
  ShipType,
  cellKey,
  inBounds,
  shipCells,
} from "./types";

let _id = 0;
const nextId = () => `s${++_id}_${Math.random().toString(36).slice(2, 7)}`;

export function emptyBoard(): Board {
  return { ships: [], shots: new Map() };
}

export function occupiedCells(ships: Ship[]): Set<string> {
  const occ = new Set<string>();
  for (const s of ships) {
    for (const [r, c] of shipCells(s)) occ.add(cellKey(r, c));
  }
  return occ;
}

export function canPlace(
  ships: Ship[],
  ship: Pick<Ship, "row" | "col" | "length" | "orientation">,
  ignoreId?: string
): boolean {
  const otherShips = ignoreId ? ships.filter((s) => s.id !== ignoreId) : ships;
  const occ = occupiedCells(otherShips);
  for (const [r, c] of shipCells(ship)) {
    if (!inBounds(r, c)) return false;
    if (occ.has(cellKey(r, c))) return false;
    // No-touching rule (ships cannot be adjacent, even diagonally)
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const nr = r + dr;
        const nc = c + dc;
        if (!inBounds(nr, nc)) continue;
        if (occ.has(cellKey(nr, nc))) return false;
      }
    }
  }
  return true;
}

export function placeShip(
  ships: Ship[],
  type: ShipType,
  row: number,
  col: number,
  orientation: Orientation
): Ship[] | null {
  const def = SHIP_DEFS.find((d) => d.type === type)!;
  const candidate = { row, col, length: def.length, orientation };
  if (!canPlace(ships, candidate)) return null;
  const ship: Ship = {
    id: nextId(),
    type,
    length: def.length,
    row,
    col,
    orientation,
    hits: 0,
    sunk: false,
  };
  return [...ships, ship];
}

export function moveShip(
  ships: Ship[],
  shipId: string,
  row: number,
  col: number,
  orientation: Orientation
): Ship[] | null {
  const ship = ships.find((s) => s.id === shipId);
  if (!ship) return null;
  const candidate = { row, col, length: ship.length, orientation };
  if (!canPlace(ships, candidate, shipId)) return null;
  return ships.map((s) => (s.id === shipId ? { ...s, row, col, orientation } : s));
}

export function removeShip(ships: Ship[], shipId: string): Ship[] {
  return ships.filter((s) => s.id !== shipId);
}

export function autoPlace(): Ship[] {
  for (let attempt = 0; attempt < 200; attempt++) {
    let ships: Ship[] = [];
    let ok = true;
    for (const def of SHIP_DEFS) {
      let placed = false;
      for (let tries = 0; tries < 200; tries++) {
        const orientation: Orientation = Math.random() < 0.5 ? "H" : "V";
        const row = Math.floor(Math.random() * BOARD_SIZE);
        const col = Math.floor(Math.random() * BOARD_SIZE);
        const next = placeShip(ships, def.type, row, col, orientation);
        if (next) {
          ships = next;
          placed = true;
          break;
        }
      }
      if (!placed) {
        ok = false;
        break;
      }
    }
    if (ok) return ships;
  }
  // Should rarely happen — return whatever we have
  return [];
}

export interface AttackResult {
  state: CellState; // miss | hit | sunk
  shipId?: string;
  sunkShip?: Ship;
  win?: boolean;
}

export function applyAttack(board: Board, r: number, c: number): { board: Board; result: AttackResult } {
  const key = cellKey(r, c);
  if (board.shots.has(key)) {
    return { board, result: { state: board.shots.get(key)! } };
  }
  const newShots = new Map(board.shots);
  let hitShip: Ship | undefined;
  for (const s of board.ships) {
    for (const [sr, sc] of shipCells(s)) {
      if (sr === r && sc === c) {
        hitShip = s;
        break;
      }
    }
    if (hitShip) break;
  }
  if (!hitShip) {
    newShots.set(key, "miss");
    return { board: { ...board, shots: newShots }, result: { state: "miss" } };
  }
  const updatedShips = board.ships.map((s) => {
    if (s.id !== hitShip!.id) return s;
    const hits = s.hits + 1;
    const sunk = hits >= s.length;
    return { ...s, hits, sunk };
  });
  const updatedShip = updatedShips.find((s) => s.id === hitShip!.id)!;
  if (updatedShip.sunk) {
    for (const [sr, sc] of shipCells(updatedShip)) {
      newShots.set(cellKey(sr, sc), "sunk");
    }
  } else {
    newShots.set(key, "hit");
  }
  const win = updatedShips.every((s) => s.sunk);
  return {
    board: { ships: updatedShips, shots: newShots },
    result: {
      state: updatedShip.sunk ? "sunk" : "hit",
      shipId: updatedShip.id,
      sunkShip: updatedShip.sunk ? updatedShip : undefined,
      win,
    },
  };
}

export function allSunk(board: Board): boolean {
  return board.ships.length > 0 && board.ships.every((s) => s.sunk);
}
