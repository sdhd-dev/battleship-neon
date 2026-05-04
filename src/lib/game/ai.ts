import { BOARD_SIZE, CellState, Difficulty, Ship, cellKey, inBounds } from "./types";

export interface AIState {
  difficulty: Difficulty;
  // Tracking from AI's perspective:
  shots: Map<string, CellState>; // r,c -> miss | hit | sunk
  // Hits that haven't been resolved into a sunk ship yet (medium AI uses these)
  unresolvedHits: Array<[number, number]>;
  // Remaining ship lengths the AI thinks the human still has
  remainingLengths: number[];
}

export function createAIState(difficulty: Difficulty, shipLengths: number[]): AIState {
  return {
    difficulty,
    shots: new Map(),
    unresolvedHits: [],
    remainingLengths: [...shipLengths],
  };
}

function randomUnshotCell(shots: Map<string, CellState>): [number, number] {
  const open: Array<[number, number]> = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (!shots.has(cellKey(r, c))) open.push([r, c]);
    }
  }
  return open[Math.floor(Math.random() * open.length)];
}

function neighbors(r: number, c: number): Array<[number, number]> {
  return [
    [r - 1, c],
    [r + 1, c],
    [r, c - 1],
    [r, c + 1],
  ];
}

// Compute probability density: for each remaining ship, count how many ways it
// can be placed on the board such that it covers each cell, given known shots.
// Cells with hits but not sunk are forced to be included if a placement passes
// through them (search-and-destroy mode), giving huge probability to cells
// adjacent to existing hits.
export function probabilityDensity(state: AIState): number[][] {
  const density: number[][] = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(0));
  const shots = state.shots;

  const unresolvedHitSet = new Set(state.unresolvedHits.map(([r, c]) => cellKey(r, c)));
  const inHuntMode = unresolvedHitSet.size > 0;

  for (const length of state.remainingLengths) {
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        // Horizontal placements
        if (c + length <= BOARD_SIZE) {
          let valid = true;
          let coversHit = false;
          for (let i = 0; i < length; i++) {
            const k = cellKey(r, c + i);
            const cell = shots.get(k);
            if (cell === "miss" || cell === "sunk") {
              valid = false;
              break;
            }
            if (unresolvedHitSet.has(k)) coversHit = true;
          }
          if (valid && (!inHuntMode || coversHit)) {
            const weight = coversHit ? 50 : 1;
            for (let i = 0; i < length; i++) {
              if (!shots.has(cellKey(r, c + i))) {
                density[r][c + i] += weight;
              }
            }
          }
        }
        // Vertical placements
        if (r + length <= BOARD_SIZE) {
          let valid = true;
          let coversHit = false;
          for (let i = 0; i < length; i++) {
            const k = cellKey(r + i, c);
            const cell = shots.get(k);
            if (cell === "miss" || cell === "sunk") {
              valid = false;
              break;
            }
            if (unresolvedHitSet.has(k)) coversHit = true;
          }
          if (valid && (!inHuntMode || coversHit)) {
            const weight = coversHit ? 50 : 1;
            for (let i = 0; i < length; i++) {
              if (!shots.has(cellKey(r + i, c))) {
                density[r + i][c] += weight;
              }
            }
          }
        }
      }
    }
  }

  // Parity bonus when in pure hunt: prefer cells (r+c) % 2 === 0
  if (!inHuntMode) {
    const minLen = Math.min(...state.remainingLengths);
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if ((r + c) % minLen !== 0) {
          density[r][c] = Math.floor(density[r][c] * 0.7);
        }
      }
    }
  }

  return density;
}

function pickBestFromDensity(state: AIState): [number, number] {
  const d = probabilityDensity(state);
  let best: [number, number] | null = null;
  let bestScore = -1;
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (state.shots.has(cellKey(r, c))) continue;
      if (d[r][c] > bestScore) {
        bestScore = d[r][c];
        best = [r, c];
      }
    }
  }
  return best ?? randomUnshotCell(state.shots);
}

// Medium AI: random hunt, but when a hit lands, attack adjacent cells.
function mediumPick(state: AIState): [number, number] {
  if (state.unresolvedHits.length > 0) {
    // If two or more hits are in a line, extend along that line.
    if (state.unresolvedHits.length >= 2) {
      const sorted = [...state.unresolvedHits].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      const [r1, c1] = sorted[0];
      const [r2, c2] = sorted[sorted.length - 1];
      if (r1 === r2) {
        // Horizontal line — try left, then right
        const candidates: Array<[number, number]> = [
          [r1, c1 - 1],
          [r2, c2 + 1],
        ];
        for (const [r, c] of candidates) {
          if (inBounds(r, c) && !state.shots.has(cellKey(r, c))) return [r, c];
        }
      } else if (c1 === c2) {
        const candidates: Array<[number, number]> = [
          [r1 - 1, c1],
          [r2 + 1, c2],
        ];
        for (const [r, c] of candidates) {
          if (inBounds(r, c) && !state.shots.has(cellKey(r, c))) return [r, c];
        }
      }
    }
    // Otherwise, pick a random unresolved hit and try a neighbor
    const order = [...state.unresolvedHits].sort(() => Math.random() - 0.5);
    for (const [r, c] of order) {
      const ns = neighbors(r, c).filter(([nr, nc]) => inBounds(nr, nc) && !state.shots.has(cellKey(nr, nc)));
      if (ns.length) return ns[Math.floor(Math.random() * ns.length)];
    }
  }
  // Hunt with parity
  const open: Array<[number, number]> = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if ((r + c) % 2 === 0 && !state.shots.has(cellKey(r, c))) open.push([r, c]);
    }
  }
  if (open.length) return open[Math.floor(Math.random() * open.length)];
  return randomUnshotCell(state.shots);
}

export function aiNextMove(state: AIState): [number, number] {
  switch (state.difficulty) {
    case "easy":
      return randomUnshotCell(state.shots);
    case "medium":
      return mediumPick(state);
    case "hard":
      return pickBestFromDensity(state);
  }
}

// After the AI fires, update its tracking based on the result.
export function recordAIShot(
  state: AIState,
  r: number,
  c: number,
  result: CellState,
  sunkShip?: Ship
): AIState {
  const shots = new Map(state.shots);
  shots.set(cellKey(r, c), result);
  let unresolvedHits = state.unresolvedHits.slice();
  const remainingLengths = state.remainingLengths.slice();

  if (result === "hit") {
    unresolvedHits.push([r, c]);
  } else if (result === "sunk" && sunkShip) {
    // All cells of the sunk ship are resolved. Remove from unresolved hits.
    const sunkSet = new Set<string>();
    for (let i = 0; i < sunkShip.length; i++) {
      const sr = sunkShip.orientation === "V" ? sunkShip.row + i : sunkShip.row;
      const sc = sunkShip.orientation === "H" ? sunkShip.col + i : sunkShip.col;
      sunkSet.add(cellKey(sr, sc));
      shots.set(cellKey(sr, sc), "sunk");
    }
    unresolvedHits = unresolvedHits.filter(([hr, hc]) => !sunkSet.has(cellKey(hr, hc)));
    // Remove one occurrence of sunkShip.length
    const idx = remainingLengths.indexOf(sunkShip.length);
    if (idx >= 0) remainingLengths.splice(idx, 1);
  }

  return { ...state, shots, unresolvedHits, remainingLengths };
}
