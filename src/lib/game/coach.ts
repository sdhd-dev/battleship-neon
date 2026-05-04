import { BOARD_SIZE, Board, CellState, Difficulty, Ship, cellKey, shipCells } from "./types";

export interface CoachReport {
  headline: string;
  grade: "S" | "A" | "B" | "C" | "D";
  accuracy: number; // 0..1
  huntEfficiency: number; // 0..1 — fraction of hits that landed adjacent to prior hits
  edgeBias: number; // fraction of shots on edge cells
  parityScore: number; // fraction of shots on optimal parity
  tips: string[];
}

export interface CoachInput {
  playerShots: Map<string, CellState>;
  enemyBoard: Board;
  result: "win" | "loss";
  difficulty: Difficulty;
  durationMs: number;
}

function isAdjacentToHit(
  r: number,
  c: number,
  shotsBefore: Map<string, CellState>
): boolean {
  for (const [dr, dc] of [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ] as Array<[number, number]>) {
    const nr = r + dr;
    const nc = c + dc;
    const k = cellKey(nr, nc);
    const v = shotsBefore.get(k);
    if (v === "hit" || v === "sunk") return true;
  }
  return false;
}

function shipPlacementSafety(ships: Ship[]): number {
  // 0..1 — penalize touching the edge with multiple ships
  let edgeShipCells = 0;
  let total = 0;
  for (const s of ships) {
    for (const [r, c] of shipCells(s)) {
      total++;
      if (r === 0 || c === 0 || r === BOARD_SIZE - 1 || c === BOARD_SIZE - 1) edgeShipCells++;
    }
  }
  if (!total) return 1;
  return 1 - edgeShipCells / total;
}

export function analyzeGame(input: CoachInput): CoachReport {
  const { playerShots, enemyBoard, result, difficulty, durationMs } = input;
  const shots = Array.from(playerShots.entries());
  const totalShots = shots.length;
  const hits = shots.filter(([, s]) => s === "hit" || s === "sunk").length;
  const accuracy = totalShots ? hits / totalShots : 0;

  // Hunt efficiency: count how many hits/sunks landed adjacent to a prior hit
  let adjacentHits = 0;
  const incremental = new Map<string, CellState>();
  // We don't have shot order here; approximate by replaying shots in deterministic order
  // (still useful as a heuristic).
  const ordered = [...shots];
  for (const [k, s] of ordered) {
    const [r, c] = k.split(",").map(Number);
    if ((s === "hit" || s === "sunk") && isAdjacentToHit(r, c, incremental)) {
      adjacentHits++;
    }
    incremental.set(k, s);
  }
  const huntEfficiency = hits ? adjacentHits / hits : 0;

  let edgeShots = 0;
  let parityShots = 0;
  for (const [k] of shots) {
    const [r, c] = k.split(",").map(Number);
    if (r === 0 || c === 0 || r === BOARD_SIZE - 1 || c === BOARD_SIZE - 1) edgeShots++;
    if ((r + c) % 2 === 0) parityShots++;
  }
  const edgeBias = totalShots ? edgeShots / totalShots : 0;
  const parityScore = totalShots ? parityShots / totalShots : 0;

  const safety = shipPlacementSafety(enemyBoard.ships);

  // Grade
  let score = 0;
  score += accuracy * 50;
  score += huntEfficiency * 30;
  score += parityScore * 10;
  if (result === "win") score += 15;
  if (difficulty === "hard") score += 10;
  if (difficulty === "medium") score += 5;
  score = Math.max(0, Math.min(100, score));
  const grade: CoachReport["grade"] = score >= 85 ? "S" : score >= 70 ? "A" : score >= 55 ? "B" : score >= 40 ? "C" : "D";

  const tips: string[] = [];
  if (accuracy < 0.25) {
    tips.push("Your accuracy is low. Try a checkerboard pattern (cells where row+col is even) to find ships faster — the smallest ship is 2 cells long, so you only need to hit every other cell.");
  } else if (accuracy < 0.4) {
    tips.push("Decent accuracy, but you can squeeze more out of the hunt phase. Switch to parity shooting until you get your first hit.");
  } else {
    tips.push("Great accuracy! Your shot selection is locked in.");
  }

  if (huntEfficiency < 0.4 && hits > 2) {
    tips.push("After a hit, prioritize the four orthogonal neighbors before going elsewhere. Once you score two hits in a row, extend along that line in both directions.");
  } else if (huntEfficiency >= 0.6) {
    tips.push("Your search-and-destroy is sharp — you're following hits to their kill cleanly.");
  }

  if (edgeBias > 0.45) {
    tips.push("You're shooting the edges a lot. Big ships are usually placed in the middle — consider exploring the interior first.");
  }
  if (safety < 0.5) {
    tips.push("Your own ships hugged the edge. Mixing edge and interior placement makes you harder to predict.");
  }
  if (durationMs < 60_000 && result === "loss") {
    tips.push("That was fast — you might be firing too quickly. A few seconds to consider density can flip a loss into a win.");
  }
  if (difficulty === "easy" && result === "loss") {
    tips.push("Lost on Easy? Re-read your last 5 shots — likely you skipped a hit's neighbor.");
  }
  if (difficulty === "hard" && result === "win") {
    tips.push("Beating Hard means your probability sense is real. Try Blitz mode for the next tier.");
  }

  const headline =
    result === "win"
      ? `Victory — ${grade} game (${Math.round(accuracy * 100)}% accuracy)`
      : `Defeat — ${grade} effort (${Math.round(accuracy * 100)}% accuracy)`;

  return {
    headline,
    grade,
    accuracy,
    huntEfficiency,
    edgeBias,
    parityScore,
    tips: tips.slice(0, 4),
  };
}
