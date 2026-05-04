"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import clsx from "clsx";
import {
  Orientation,
  SHIP_DEFS,
  Ship,
  ShipType,
} from "@/lib/game/types";
import { autoPlace, canPlace, moveShip, placeShip, removeShip } from "@/lib/game/board";
import { Board } from "./Board";

interface ShipPlacementProps {
  ships: Ship[];
  onChange: (ships: Ship[]) => void;
  onConfirm: () => void;
  onBack?: () => void;
}

export function ShipPlacement({ ships, onChange, onConfirm, onBack }: ShipPlacementProps) {
  const [selectedType, setSelectedType] = useState<ShipType | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [orientation, setOrientation] = useState<Orientation>("H");
  const [hover, setHover] = useState<{ r: number; c: number } | null>(null);

  const remaining = useMemo(() => {
    const counts = new Map<ShipType, number>();
    for (const s of ships) counts.set(s.type, (counts.get(s.type) ?? 0) + 1);
    return SHIP_DEFS.filter((d) => (counts.get(d.type) ?? 0) === 0);
  }, [ships]);

  const allPlaced = remaining.length === 0;

  const board = { ships, shots: new Map() };

  const previewLength =
    draggingId !== null
      ? ships.find((s) => s.id === draggingId)?.length ?? null
      : selectedType
        ? SHIP_DEFS.find((d) => d.type === selectedType)?.length ?? null
        : null;

  const previewOrientation =
    draggingId !== null ? ships.find((s) => s.id === draggingId)?.orientation ?? orientation : orientation;

  const preview = useMemo(() => {
    if (!hover || !previewLength) return null;
    const cells: Array<[number, number]> = [];
    for (let i = 0; i < previewLength; i++) {
      const r = previewOrientation === "V" ? hover.r + i : hover.r;
      const c = previewOrientation === "H" ? hover.c + i : hover.c;
      cells.push([r, c]);
    }
    const valid = canPlace(
      ships,
      { row: hover.r, col: hover.c, length: previewLength, orientation: previewOrientation },
      draggingId ?? undefined
    );
    return { cells, valid };
  }, [hover, previewLength, previewOrientation, ships, draggingId]);

  const handleCellClick = (r: number, c: number) => {
    if (draggingId !== null) {
      const next = moveShip(ships, draggingId, r, c, previewOrientation);
      if (next) {
        onChange(next);
        setDraggingId(null);
      }
      return;
    }
    if (selectedType) {
      const next = placeShip(ships, selectedType, r, c, orientation);
      if (next) {
        onChange(next);
        setSelectedType(null);
      }
    } else {
      // Click on a placed ship to drag it
      const ship = ships.find((s) =>
        s.orientation === "H"
          ? s.row === r && c >= s.col && c < s.col + s.length
          : s.col === c && r >= s.row && r < s.row + s.length
      );
      if (ship) {
        setDraggingId(ship.id);
        setOrientation(ship.orientation);
      }
    }
  };

  return (
    <div className="grid xl:grid-cols-[1fr_auto] gap-6 items-start">
      <div className="glass rounded-3xl p-4 sm:p-6 min-w-0 overflow-x-auto">
        <Board
          board={board}
          revealShips
          compact
          onCellClick={handleCellClick}
          onCellHover={(r, c) => setHover({ r, c })}
          onCellLeave={() => setHover(null)}
          preview={preview}
          highlightShip={draggingId}
          label="Your Fleet — Position the Ships"
        />
      </div>

      <div className="glass rounded-3xl p-5 sm:p-6 w-full xl:w-[340px] flex flex-col gap-4 xl:max-h-[calc(100vh-2rem)]">
        <div className="shrink-0">
          <div className="text-xs uppercase tracking-[0.3em] text-fg-dim">Step 01</div>
          <h2 className="text-2xl font-bold neon-text">Deploy Your Fleet</h2>
          <p className="text-sm text-fg-dim mt-1">
            Tap a ship below, then tap the grid to drop it. Tap a placed ship to move it.
          </p>
        </div>

        <div className="shrink-0 flex gap-2 flex-wrap">
          <button
            onClick={() => setOrientation((o) => (o === "H" ? "V" : "H"))}
            className="neon-btn rounded-xl px-3 py-2 text-sm"
          >
            Rotate · {orientation === "H" ? "↔ Horizontal" : "↕ Vertical"}
          </button>
          <button
            onClick={() => onChange(autoPlace())}
            className="neon-btn rounded-xl px-3 py-2 text-sm"
          >
            ⚡ Auto-Place
          </button>
          <button
            onClick={() => onChange([])}
            className="rounded-xl px-3 py-2 text-sm border border-white/20 hover:bg-white/5"
          >
            Clear
          </button>
        </div>

        <div className="flex flex-col gap-2 xl:flex-1 xl:min-h-0 xl:overflow-y-auto xl:pr-1">
          <div className="text-xs uppercase tracking-[0.3em] text-fg-dim">Fleet</div>
          {SHIP_DEFS.map((def) => {
            const placed = ships.find((s) => s.type === def.type);
            const active = selectedType === def.type;
            return (
              <motion.button
                key={def.type}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  if (placed) {
                    onChange(removeShip(ships, placed.id));
                  } else {
                    setSelectedType((t) => (t === def.type ? null : def.type));
                  }
                }}
                className={clsx(
                  "rounded-xl px-3 py-2 flex items-center justify-between text-left border transition-all",
                  placed
                    ? "border-accent/50 bg-accent/10"
                    : active
                      ? "border-accent bg-accent/15 shadow-[0_0_18px_rgba(0,240,255,0.4)]"
                      : "border-white/10 hover:border-white/30"
                )}
              >
                <div>
                  <div className="font-semibold">{def.name}</div>
                  <div className="text-xs text-fg-dim">{def.length} cells</div>
                </div>
                <div className="flex gap-1">
                  {Array.from({ length: def.length }).map((_, i) => (
                    <div
                      key={i}
                      className={clsx(
                        "w-2.5 h-2.5 rounded-sm",
                        placed ? "bg-accent" : active ? "bg-accent-2" : "bg-white/20"
                      )}
                    />
                  ))}
                </div>
              </motion.button>
            );
          })}
        </div>

        <div className="shrink-0 flex gap-2 mt-1">
          {onBack && (
            <button
              onClick={onBack}
              className="flex-1 rounded-xl px-4 py-3 border border-white/15 hover:bg-white/5"
            >
              Back
            </button>
          )}
          <AnimatePresence>
            <motion.button
              key={String(allPlaced)}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              disabled={!allPlaced}
              onClick={onConfirm}
              className={clsx(
                "flex-1 rounded-xl px-4 py-3 font-semibold",
                allPlaced ? "neon-btn pulse-glow" : "border border-white/10 text-fg-dim cursor-not-allowed"
              )}
            >
              {allPlaced ? "⚔ Engage" : `Place ${remaining.length} more`}
            </motion.button>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
