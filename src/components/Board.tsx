"use client";

import { motion } from "framer-motion";
import clsx from "clsx";
import { BOARD_SIZE, Board as BoardData, CellState, Ship, cellKey, shipCells } from "@/lib/game/types";

interface BoardProps {
  board: BoardData;
  revealShips?: boolean;
  onCellClick?: (r: number, c: number) => void;
  onCellHover?: (r: number, c: number) => void;
  onCellLeave?: () => void;
  preview?: { cells: Array<[number, number]>; valid: boolean } | null;
  highlightShip?: string | null;
  disabled?: boolean;
  label?: string;
  compact?: boolean;
  glowCells?: Array<[number, number]>;
  arrowCells?: Array<[number, number]>;
  // Cells that have been radar-scanned: ship presence becomes visible
  // even if `revealShips` is false. Render with a cyan pulse outline.
  scannedCells?: Array<[number, number]>;
  // Cells that are currently shrouded by a smokescreen power. Visually
  // overlaid with a dim cloud tint.
  smokedCells?: Array<[number, number]>;
}

const COLS = "ABCDEFGHIJ".split("");

export function Board({
  board,
  revealShips,
  onCellClick,
  onCellHover,
  onCellLeave,
  preview,
  highlightShip,
  disabled,
  label,
  compact,
  glowCells,
  arrowCells,
  scannedCells,
  smokedCells,
}: BoardProps) {
  const shipMap = new Map<string, Ship>();
  for (const s of board.ships) {
    for (const [r, c] of shipCells(s)) shipMap.set(cellKey(r, c), s);
  }

  const previewSet = new Set<string>();
  if (preview) {
    for (const [r, c] of preview.cells) previewSet.add(cellKey(r, c));
  }

  const glowSet = new Set<string>();
  if (glowCells) {
    for (const [r, c] of glowCells) glowSet.add(cellKey(r, c));
  }
  const arrowSet = new Set<string>();
  if (arrowCells) {
    for (const [r, c] of arrowCells) arrowSet.add(cellKey(r, c));
  }
  const scannedSet = new Set<string>();
  if (scannedCells) {
    for (const [r, c] of scannedCells) scannedSet.add(cellKey(r, c));
  }
  const smokedSet = new Set<string>();
  if (smokedCells) {
    for (const [r, c] of smokedCells) smokedSet.add(cellKey(r, c));
  }

  const cellSize = compact ? "w-6 h-6 sm:w-8 sm:h-8" : "w-7 h-7 sm:w-10 sm:h-10 md:w-11 md:h-11";

  return (
    <div className={clsx("inline-flex flex-col gap-2 no-select max-w-full", disabled && "opacity-70")}>
      {label && (
        <div className="flex items-center justify-between text-xs uppercase tracking-[0.3em] text-fg-dim gap-2 min-w-0">
          <span className="truncate">{label}</span>
          {highlightShip && <span className="text-accent shrink-0">⚓ {highlightShip}</span>}
        </div>
      )}
      <div className="glass neon-border rounded-2xl p-1.5 sm:p-4 scan">
        <div className="flex">
          <div className={clsx(cellSize, "flex items-center justify-center")} />
          {COLS.map((c) => (
            <div key={c} className={clsx(cellSize, "flex items-center justify-center text-[10px] sm:text-xs text-fg-dim")}>
              {c}
            </div>
          ))}
        </div>
        {Array.from({ length: BOARD_SIZE }).map((_, r) => (
          <div className="flex" key={r}>
            <div className={clsx(cellSize, "flex items-center justify-center text-[10px] sm:text-xs text-fg-dim")}>{r + 1}</div>
            {Array.from({ length: BOARD_SIZE }).map((_, c) => {
              const k = cellKey(r, c);
              const shotState = board.shots.get(k);
              const ship = shipMap.get(k);
              const isPreview = previewSet.has(k);

              const isScanned = scannedSet.has(k);
              const isSmoked = smokedSet.has(k);
              const showShip =
                (revealShips || (isScanned && ship)) &&
                ship &&
                shotState !== "sunk" &&
                shotState !== "hit";
              const isHighlighted = highlightShip && ship?.id === highlightShip;
              const isGlow = glowSet.has(k) && !shotState;
              const hasArrow = arrowSet.has(k) && !shotState;

              const classes = clsx(
                "cell rounded-md sm:m-[1px]",
                cellSize,
                shotState === "miss" && "miss",
                shotState === "hit" && "hit",
                shotState === "sunk" && "sunk",
                showShip && !shotState && "ship",
                isPreview && (preview?.valid ? "preview-ok" : "preview-bad"),
                isHighlighted && "ring-2 ring-accent",
                isGlow && "glow",
                !disabled && onCellClick && !shotState && "cursor-crosshair"
              );

              return (
                <motion.div
                  key={k}
                  className={classes}
                  whileHover={!disabled && onCellClick ? { scale: 1.06 } : undefined}
                  whileTap={!disabled && onCellClick ? { scale: 0.94 } : undefined}
                  onClick={() => !disabled && onCellClick?.(r, c)}
                  onMouseEnter={() => onCellHover?.(r, c)}
                  onMouseLeave={() => onCellLeave?.()}
                  style={{ position: "relative" }}
                >
                  <CellMark state={shotState} />
                  {hasArrow && <span className="tut-arrow">▼</span>}
                  {isScanned && !shotState && (
                    <motion.div
                      aria-hidden
                      initial={{ opacity: 0 }}
                      animate={{ opacity: [0.2, 0.7, 0.2] }}
                      transition={{ duration: 1.6, repeat: Infinity }}
                      className="absolute inset-0 rounded-md pointer-events-none"
                      style={{
                        boxShadow: "inset 0 0 0 2px #22d3ee",
                      }}
                    />
                  )}
                  {isSmoked && (
                    <motion.div
                      aria-hidden
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 0.55 }}
                      className="absolute inset-0 rounded-md pointer-events-none"
                      style={{
                        background:
                          "radial-gradient(circle, rgba(148,163,184,0.55), rgba(15,23,42,0.85))",
                      }}
                    />
                  )}
                </motion.div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function CellMark({ state }: { state?: CellState }) {
  if (!state) return null;
  if (state === "miss") {
    return (
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        className="absolute inset-0 flex items-center justify-center"
      >
        <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-fg-dim/70" />
      </motion.div>
    );
  }
  return (
    <motion.div
      initial={{ scale: 0, rotate: -45 }}
      animate={{ scale: 1, rotate: 0 }}
      className="absolute inset-0 flex items-center justify-center text-[10px] sm:text-xs font-bold"
    >
      <span style={{ filter: "drop-shadow(0 0 6px currentColor)" }}>
        {state === "sunk" ? "☠" : "✕"}
      </span>
    </motion.div>
  );
}
