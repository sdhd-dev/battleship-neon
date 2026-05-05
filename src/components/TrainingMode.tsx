"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import clsx from "clsx";
import { Board } from "./Board";
import {
  Board as BoardData,
  Ship,
  cellKey,
  inBounds,
} from "@/lib/game/types";
import { applyAttack } from "@/lib/game/board";
import { grantCoins } from "@/lib/economy";
import { loadProfile, saveProfile, syncCloudProfile } from "@/lib/storage";
import { GRADUATE_BADGE_ID } from "@/lib/shop-catalog";
import { notify } from "@/lib/notify";

const TOTAL_STEPS = 5;
const REWARD_COINS = 25;
const TRAINING_COMPLETED_KEY = "bs.training.completed";

interface TrainingModeProps {
  onExit: (completed: boolean, rewarded: boolean) => void;
}

type Step = 1 | 2 | 3 | 4 | 5;

// Step 2 — pre-place 4 ships, ask the player to drop the destroyer at row 8 cols 0..1
const PLACEMENT_FLEET: Ship[] = [
  { id: "tut-carrier", type: "carrier", length: 5, row: 0, col: 0, orientation: "H", hits: 0, sunk: false },
  { id: "tut-battleship", type: "battleship", length: 4, row: 2, col: 0, orientation: "H", hits: 0, sunk: false },
  { id: "tut-cruiser", type: "cruiser", length: 3, row: 4, col: 0, orientation: "H", hits: 0, sunk: false },
  { id: "tut-submarine", type: "submarine", length: 3, row: 6, col: 0, orientation: "H", hits: 0, sunk: false },
];
const DESTROYER_TARGETS: Array<[number, number]> = [
  [8, 0],
  [8, 1],
];

// Step 3 — single revealed enemy ship to fire at
const STEP3_TARGETS: Array<[number, number]> = [
  [3, 3],
  [3, 4],
];

// Step 4 — hidden cruiser, middle pre-hit; player has to learn to follow up
const STEP4_SHIP: Ship = {
  id: "tut-enemy-cruiser",
  type: "cruiser",
  length: 3,
  row: 5,
  col: 3,
  orientation: "H",
  hits: 1,
  sunk: false,
};

export function TrainingMode({ onExit }: TrainingModeProps) {
  const [step, setStep] = useState<Step>(1);

  // ── Step 2 state: ship placement
  const [placedDestroyer, setPlacedDestroyer] = useState(false);

  // ── Step 3 state: shoot a revealed ship
  const [step3Board, setStep3Board] = useState<BoardData>(() => ({
    ships: [
      {
        id: "tut-enemy-destroyer",
        type: "destroyer",
        length: 2,
        row: STEP3_TARGETS[0][0],
        col: STEP3_TARGETS[0][1],
        orientation: "H",
        hits: 0,
        sunk: false,
      },
    ],
    shots: new Map(),
  }));

  // ── Step 4 state: hunt strategy
  const [step4Board, setStep4Board] = useState<BoardData>(() => {
    const shots = new Map<string, "miss" | "hit" | "sunk">();
    // pre-hit the middle cell of the cruiser so the player sees the context
    shots.set(cellKey(STEP4_SHIP.row, STEP4_SHIP.col + 1), "hit");
    return {
      ships: [STEP4_SHIP],
      shots,
    };
  });

  // ── Step 4 helper: glow valid neighbors of any non-sunk hit on the board
  const step4Glow = useMemo<Array<[number, number]>>(() => {
    if (step !== 4) return [];
    return huntCandidates(step4Board);
  }, [step, step4Board]);

  const placeBoard: BoardData = useMemo(() => {
    if (placedDestroyer) {
      return {
        ships: [
          ...PLACEMENT_FLEET,
          {
            id: "tut-destroyer",
            type: "destroyer",
            length: 2,
            row: 8,
            col: 0,
            orientation: "H",
            hits: 0,
            sunk: false,
          },
        ],
        shots: new Map(),
      };
    }
    return { ships: PLACEMENT_FLEET, shots: new Map() };
  }, [placedDestroyer]);

  const handlePlaceClick = (r: number, c: number) => {
    if (placedDestroyer) return;
    const isTarget = DESTROYER_TARGETS.some(([tr, tc]) => tr === r && tc === c);
    if (!isTarget) return;
    setPlacedDestroyer(true);
  };

  const handleStep3Shot = (r: number, c: number) => {
    if (step3Board.shots.has(cellKey(r, c))) return;
    const isTarget = STEP3_TARGETS.some(([tr, tc]) => tr === r && tc === c);
    if (!isTarget) return; // gentle: ignore off-target clicks during tutorial
    const { board: next } = applyAttack(step3Board, r, c);
    setStep3Board(next);
  };

  const handleStep4Shot = (r: number, c: number) => {
    if (step4Board.shots.has(cellKey(r, c))) return;
    if (!step4Glow.some(([gr, gc]) => gr === r && gc === c)) return; // restrict to suggestions
    const { board: next } = applyAttack(step4Board, r, c);
    setStep4Board(next);
  };

  const step3Sunk = step3Board.ships.every((s) => s.sunk);
  const step4Sunk = step4Board.ships.every((s) => s.sunk);

  const canAdvance =
    step === 1 ||
    (step === 2 && placedDestroyer) ||
    (step === 3 && step3Sunk) ||
    (step === 4 && step4Sunk) ||
    step === 5;

  const goNext = () => {
    if (!canAdvance) return;
    if (step < TOTAL_STEPS) {
      setStep((s) => (s + 1) as Step);
    }
    // Step 5 reaches via the "Play your first real game" button → onExit.
  };

  const [completed, setCompleted] = useState(false);
  const [rewarded, setRewarded] = useState(false);

  useEffect(() => {
    if (step !== 5 || completed) return;
    if (typeof window === "undefined") return;

    const profile = loadProfile();
    const alreadyGraduated = (profile.ownedCosmetics ?? []).includes(
      GRADUATE_BADGE_ID
    );
    const flagged = localStorage.getItem(TRAINING_COMPLETED_KEY) === "1";

    if (!alreadyGraduated && !flagged) {
      // grantCoins reads → mutates → saves localStorage. Re-load AFTER it so
      // the badge save below doesn't clobber the +25 with a stale snapshot.
      grantCoins(REWARD_COINS, "Training Mode");
      const fresh = loadProfile();
      const owned = new Set(fresh.ownedCosmetics ?? []);
      owned.add(GRADUATE_BADGE_ID);
      const next = {
        ...fresh,
        ownedCosmetics: Array.from(owned),
        activeBadge: fresh.activeBadge ?? GRADUATE_BADGE_ID,
      };
      saveProfile(next);
      void syncCloudProfile(next);
      localStorage.setItem(TRAINING_COMPLETED_KEY, "1");
      notify(`🎓 +${REWARD_COINS} coins earned for completing training!`, "success");
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRewarded(true);
    } else {
      // Backfill the flag for users who graduated before we tracked it, so
      // future runs short-circuit on the cheap localStorage check.
      localStorage.setItem(TRAINING_COMPLETED_KEY, "1");
    }
    setCompleted(true);
  }, [step, completed]);

  // Auto-close the tutorial after the reward screen is shown.
  useEffect(() => {
    if (step !== 5) return;
    const id = setTimeout(() => onExit(true, rewarded), 3500);
    return () => clearTimeout(id);
  }, [step, onExit, rewarded]);

  return (
    <motion.div
      key="training"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="grid gap-5 relative"
    >
      <button
        onClick={() => onExit(false, false)}
        className="fixed top-20 right-4 sm:right-6 z-50 rounded-xl px-3 py-2 border border-white/20 bg-black/60 backdrop-blur text-sm hover:bg-white/10 hover:border-white/40 shadow-lg"
      >
        Skip ✕
      </button>

      <Header step={step} />

      <AnimatePresence mode="wait">
        {step === 1 && <Step1 key="s1" onContinue={goNext} />}

        {step === 2 && (
          <Step2
            key="s2"
            board={placeBoard}
            placed={placedDestroyer}
            onCellClick={handlePlaceClick}
            onContinue={goNext}
          />
        )}

        {step === 3 && (
          <Step3
            key="s3"
            board={step3Board}
            sunk={step3Sunk}
            onCellClick={handleStep3Shot}
            onContinue={goNext}
          />
        )}

        {step === 4 && (
          <Step4
            key="s4"
            board={step4Board}
            glow={step4Glow}
            sunk={step4Sunk}
            onCellClick={handleStep4Shot}
            onContinue={goNext}
          />
        )}

        {step === 5 && (
          <Step5
            key="s5"
            rewarded={rewarded}
            onPlayReal={() => onExit(true, rewarded)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Header / progress ───────────────────────────────────────────
function Header({ step }: { step: Step }) {
  const pct = (step / TOTAL_STEPS) * 100;
  return (
    <div className="glass rounded-3xl p-4 sm:p-5 flex flex-wrap items-center gap-4 pr-24 sm:pr-28">
      <div className="flex items-center gap-3">
        <span className="text-3xl">🎓</span>
        <div>
          <div className="text-[10px] uppercase tracking-[0.4em] text-fg-dim">
            Training Mode
          </div>
          <div className="text-lg font-extrabold neon-text">
            Step {step} / {TOTAL_STEPS}
          </div>
        </div>
      </div>
      <div className="flex-1 min-w-[180px] mx-2">
        <div className="h-2 rounded-full bg-white/10 overflow-hidden">
          <motion.div
            className="h-full"
            style={{
              background:
                "linear-gradient(90deg, var(--accent), var(--accent-2))",
              boxShadow: "0 0 12px var(--accent)",
            }}
            initial={false}
            animate={{ width: `${pct}%` }}
            transition={{ type: "spring", stiffness: 200, damping: 28 }}
          />
        </div>
      </div>
    </div>
  );
}

// ── Step 1 — Welcome ───────────────────────────────────────────
function Step1({ onContinue }: { onContinue: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="glass neon-border rounded-3xl p-6 sm:p-8 grid gap-4"
    >
      <div className="text-[10px] uppercase tracking-[0.4em] text-fg-dim">
        Welcome aboard
      </div>
      <h2 className="text-3xl sm:text-4xl font-extrabold title-grad">
        Sink the enemy fleet before they sink yours.
      </h2>
      <p className="text-sm sm:text-base text-fg-dim leading-relaxed max-w-xl">
        Battleship is a duel of deduction. You and the enemy each hide five
        ships on a 10×10 grid. Take turns calling shots — first to sink all of
        the opposing fleet wins.
      </p>
      <ul className="text-sm text-fg-dim grid gap-1 pl-4 list-disc">
        <li>5 ships, lengths 5 / 4 / 3 / 3 / 2.</li>
        <li>Ships cannot touch — not even diagonally.</li>
        <li>A hit reveals damage; sink every cell of a ship to sink it.</li>
      </ul>
      <div className="flex justify-end">
        <button
          onClick={onContinue}
          className="neon-btn rounded-2xl px-5 py-3 font-semibold pulse-glow"
        >
          Begin training →
        </button>
      </div>
    </motion.div>
  );
}

// ── Step 2 — Placement ─────────────────────────────────────────
function Step2({
  board,
  placed,
  onCellClick,
  onContinue,
}: {
  board: BoardData;
  placed: boolean;
  onCellClick: (r: number, c: number) => void;
  onContinue: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="grid xl:grid-cols-[auto_1fr] gap-6 items-start"
    >
      <div className="glass rounded-3xl p-4 sm:p-5">
        <Board
          board={board}
          revealShips
          compact
          onCellClick={onCellClick}
          glowCells={placed ? [] : DESTROYER_TARGETS}
          arrowCells={placed ? [] : [DESTROYER_TARGETS[0]]}
          label="Your Fleet — One ship to go"
        />
      </div>
      <InfoCard
        title="Deploy your last ship"
        desc={
          placed
            ? "Nice work, Captain. Your destroyer is in formation."
            : "Tap one of the glowing cells. We'll drop your destroyer there in horizontal stance."
        }
        tip={
          placed
            ? undefined
            : "Tip: in real games, scatter your ships — clumped fleets sink fast against a smart hunter."
        }
        cta={placed ? "Continue →" : undefined}
        onContinue={onContinue}
      />
    </motion.div>
  );
}

// ── Step 3 — Shooting ──────────────────────────────────────────
function Step3({
  board,
  sunk,
  onCellClick,
  onContinue,
}: {
  board: BoardData;
  sunk: boolean;
  onCellClick: (r: number, c: number) => void;
  onContinue: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="grid xl:grid-cols-[auto_1fr] gap-6 items-start"
    >
      <div className="glass rounded-3xl p-4 sm:p-5">
        <Board
          board={board}
          revealShips
          compact
          onCellClick={onCellClick}
          glowCells={sunk ? [] : STEP3_TARGETS}
          arrowCells={sunk ? [] : [STEP3_TARGETS[0]]}
          label="Enemy Waters — Fire!"
        />
      </div>
      <InfoCard
        title="Take your shot"
        desc={
          sunk
            ? "Direct hits, both barrels. Their destroyer is on the seabed."
            : "We've revealed an enemy destroyer. Click each glowing cell to fire."
        }
        tip={
          sunk
            ? undefined
            : "In real games the enemy fleet is hidden — you'll be hunting blind."
        }
        cta={sunk ? "Continue →" : undefined}
        onContinue={onContinue}
      />
    </motion.div>
  );
}

// ── Step 4 — Hunt strategy ─────────────────────────────────────
function Step4({
  board,
  glow,
  sunk,
  onCellClick,
  onContinue,
}: {
  board: BoardData;
  glow: Array<[number, number]>;
  sunk: boolean;
  onCellClick: (r: number, c: number) => void;
  onContinue: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="grid xl:grid-cols-[auto_1fr] gap-6 items-start"
    >
      <div className="glass rounded-3xl p-4 sm:p-5">
        <Board
          board={board}
          compact
          onCellClick={onCellClick}
          glowCells={sunk ? [] : glow}
          label="Enemy Waters — Hunt the line"
        />
      </div>
      <InfoCard
        title="Follow up after a hit"
        desc={
          sunk
            ? "That's how it's done — once you smell blood, walk the line until the ship goes down."
            : "We landed a hit for you (the magenta cell). Click an adjacent glowing cell — ships are straight, so the rest is in line with the hit."
        }
        tip={
          sunk
            ? undefined
            : "Hunt rule: after a hit, try the four cardinal neighbors. After a second hit, keep going down that axis."
        }
        cta={sunk ? "Continue →" : undefined}
        onContinue={onContinue}
      />
    </motion.div>
  );
}

// ── Step 5 — Victory / reward ──────────────────────────────────
function Step5({
  rewarded,
  onPlayReal,
}: {
  rewarded: boolean;
  onPlayReal: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="glass neon-border rounded-3xl p-6 sm:p-8 grid gap-5 relative overflow-hidden"
    >
      <motion.div
        aria-hidden
        className="absolute -top-16 -right-16 w-56 h-56 rounded-full pointer-events-none"
        style={{
          background:
            "radial-gradient(circle, color-mix(in oklab, #fbbf24 45%, transparent), transparent 70%)",
        }}
        animate={{ scale: [1, 1.15, 1], rotate: [0, 30, 0] }}
        transition={{ duration: 8, repeat: Infinity }}
      />
      <div className="relative z-10 grid gap-3">
        <div className="text-[10px] uppercase tracking-[0.4em] text-fg-dim">
          {rewarded ? "Mission complete" : "Refresher complete"}
        </div>
        <h2 className="text-3xl sm:text-5xl font-extrabold title-grad">
          🏆 You&apos;re cleared for the open sea.
        </h2>
        <p className="text-sm text-fg-dim max-w-xl">
          {rewarded
            ? "You know the goal, the placement rules, the shot loop, and the hunt. Two badges of progress are now on your record:"
            : "You've already graduated, Captain — rewards were claimed on your first run. Hit the seas when you're ready."}
        </p>
        {rewarded && (
          <div className="flex flex-wrap gap-3 mt-1">
            <RewardChip emoji="🎓" label="Graduate" sub="Profile badge" />
            <RewardChip emoji="⚓" label={`+${REWARD_COINS}`} sub="Naval Coins" />
          </div>
        )}
        <div className="flex flex-wrap gap-3 justify-end mt-3">
          <button
            onClick={onPlayReal}
            className="neon-btn rounded-2xl px-5 py-3 font-semibold pulse-glow"
          >
            You&apos;re ready! Play your first real game →
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function RewardChip({
  emoji,
  label,
  sub,
}: {
  emoji: string;
  label: string;
  sub: string;
}) {
  return (
    <div className="rounded-2xl px-4 py-3 border border-amber-300/40 bg-amber-300/10 flex items-center gap-3">
      <span className="text-3xl">{emoji}</span>
      <div>
        <div
          className="font-extrabold tabular-nums text-lg"
          style={{ color: "#fbbf24", textShadow: "0 0 10px #fbbf24" }}
        >
          {label}
        </div>
        <div className="text-[11px] uppercase tracking-[0.3em] text-fg-dim">
          {sub}
        </div>
      </div>
    </div>
  );
}

// ── Generic info card on the right of each interactive step ────
function InfoCard({
  title,
  desc,
  tip,
  cta,
  onContinue,
}: {
  title: string;
  desc: string;
  tip?: string;
  cta?: string;
  onContinue: () => void;
}) {
  return (
    <div className="glass rounded-3xl p-5 sm:p-6 grid gap-3 content-start">
      <div className="text-xs uppercase tracking-[0.3em] text-fg-dim">
        Instructions
      </div>
      <h3 className="text-2xl font-extrabold neon-text">{title}</h3>
      <p className="text-sm text-fg-dim leading-relaxed">{desc}</p>
      {tip && (
        <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-fg-dim">
          💡 {tip}
        </div>
      )}
      <button
        onClick={onContinue}
        disabled={!cta}
        className={clsx(
          "rounded-2xl px-4 py-3 font-semibold mt-1",
          cta
            ? "neon-btn pulse-glow"
            : "border border-white/10 text-fg-dim cursor-not-allowed"
        )}
      >
        {cta ?? "Complete the task above"}
      </button>
    </div>
  );
}

// ── Hunt-candidate logic for Step 4 (cardinal neighbors of hits) ──
function huntCandidates(board: BoardData): Array<[number, number]> {
  const hits: Array<[number, number]> = [];
  for (const [k, st] of board.shots) {
    if (st === "hit") {
      const [r, c] = k.split(",").map(Number);
      hits.push([r, c]);
    }
  }
  if (hits.length === 0) return [];

  // If we have 2+ hits on the same line, only suggest along that axis.
  if (hits.length >= 2) {
    const sameRow = hits.every(([r]) => r === hits[0][0]);
    const sameCol = hits.every(([, c]) => c === hits[0][1]);
    if (sameRow) {
      const r = hits[0][0];
      const cols = hits.map(([, c]) => c).sort((a, b) => a - b);
      const candidates: Array<[number, number]> = [
        [r, cols[0] - 1],
        [r, cols[cols.length - 1] + 1],
      ];
      return filterCandidates(candidates, board);
    }
    if (sameCol) {
      const c = hits[0][1];
      const rows = hits.map(([r]) => r).sort((a, b) => a - b);
      const candidates: Array<[number, number]> = [
        [rows[0] - 1, c],
        [rows[rows.length - 1] + 1, c],
      ];
      return filterCandidates(candidates, board);
    }
  }

  // Otherwise: 4 cardinal neighbors of every standalone hit.
  const seen = new Set<string>();
  const out: Array<[number, number]> = [];
  for (const [r, c] of hits) {
    for (const [dr, dc] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ]) {
      const nr = r + dr;
      const nc = c + dc;
      const k = cellKey(nr, nc);
      if (!inBounds(nr, nc)) continue;
      if (board.shots.has(k)) continue;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push([nr, nc]);
    }
  }
  return out;
}

function filterCandidates(
  cands: Array<[number, number]>,
  board: BoardData
): Array<[number, number]> {
  return cands.filter(([r, c]) => inBounds(r, c) && !board.shots.has(cellKey(r, c)));
}

