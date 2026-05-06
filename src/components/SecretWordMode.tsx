"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import clsx from "clsx";
import {
  Board as BoardData,
  cellKey,
  shipCells,
} from "@/lib/game/types";

const labelOf = (r: number, c: number) => `${"ABCDEFGHIJ"[c]}${r + 1}`;
import { applyAttack, autoPlace } from "@/lib/game/board";
import { Board } from "./Board";
import { RouletteWheel } from "./RouletteWheel";
import {
  AppliedAward,
  PowerType,
  bumpSecretWordWins,
  consumePower,
  pickSecretWord,
  spinsForWins,
} from "@/lib/powers";
import { PowerBar } from "./PowerBar";
import { BOARD_SIZE } from "@/lib/game/types";

interface Props {
  onExit: () => void;
}

interface LetterCell {
  r: number;
  c: number;
  letter: string;
  index: number;
  revealed: boolean;
}

const MAX_FAILED = 35;
const MAX_GUESSES = 2;

type Phase = "playing" | "won" | "lost";

// Distribute the word's letters across the placed ships. Tries to give
// every ship at least one letter before doubling up on any single ship.
function distributeLetters(ships: ReturnType<typeof autoPlace>, word: string): LetterCell[] {
  const cellsByShip = ships.map((s) => shipCells(s));
  const taken = new Set<string>();
  const result: LetterCell[] = [];
  // Shuffle ship order for variety.
  const order = cellsByShip.map((_, i) => i).sort(() => Math.random() - 0.5);
  let cursor = 0;
  for (let i = 0; i < word.length; i++) {
    let placed = false;
    for (let attempt = 0; attempt < cellsByShip.length && !placed; attempt++) {
      const shipIdx = order[(cursor + attempt) % order.length];
      const candidates = cellsByShip[shipIdx].filter(
        ([r, c]) => !taken.has(cellKey(r, c))
      );
      if (candidates.length === 0) continue;
      const [r, c] = candidates[Math.floor(Math.random() * candidates.length)];
      taken.add(cellKey(r, c));
      result.push({ r, c, letter: word[i], index: i, revealed: false });
      cursor++;
      placed = true;
    }
    if (!placed) {
      // Fallback: pick any remaining cell across all ships.
      const all: Array<[number, number]> = [];
      for (const cells of cellsByShip) {
        for (const [r, c] of cells) {
          if (!taken.has(cellKey(r, c))) all.push([r, c]);
        }
      }
      if (all.length === 0) break;
      const [r, c] = all[Math.floor(Math.random() * all.length)];
      taken.add(cellKey(r, c));
      result.push({ r, c, letter: word[i], index: i, revealed: false });
    }
  }
  return result;
}

export function SecretWordMode({ onExit }: Props) {
  const [phase, setPhase] = useState<Phase>("playing");
  const [board, setBoard] = useState<BoardData>(() => ({ ships: [], shots: new Map() }));
  const [word, setWord] = useState<string>("");
  const [letters, setLetters] = useState<LetterCell[]>([]);
  const [failedShots, setFailedShots] = useState(0);
  const [guessesLeft, setGuessesLeft] = useState(MAX_GUESSES);
  const [guessInput, setGuessInput] = useState("");
  const [statusMsg, setStatusMsg] = useState<string>("Hidden word — collect letters and guess it yourself.");
  const [toast, setToast] = useState<string | null>(null);
  const [rouletteOpen, setRouletteOpen] = useState(false);
  const [rouletteSpins, setRouletteSpins] = useState(1);
  const [rouletteAwards, setRouletteAwards] = useState<AppliedAward[] | null>(null);
  const [activePower, setActivePower] = useState<PowerType | null>(null);
  const [airstrikeDir, setAirstrikeDir] = useState<"H" | "V">("H");
  const [scanned, setScanned] = useState<Array<[number, number]>>([]);
  const initialised = useRef(false);

  // One-shot game setup: pick a word, place ships, distribute letters.
  useEffect(() => {
    if (initialised.current) return;
    initialised.current = true;
    const w = pickSecretWord();
    const ships = autoPlace();
    const lc = distributeLetters(ships, w);
    setWord(w);
    setBoard({ ships, shots: new Map() });
    setLetters(lc);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(id);
  }, [toast]);

  const failedRemaining = Math.max(0, MAX_FAILED - failedShots);

  const finishWin = useCallback(() => {
    if (phase !== "playing") return;
    setPhase("won");
    setStatusMsg("🏆 Word decoded! Spinning for loot…");
    const updated = bumpSecretWordWins(word);
    const spins = spinsForWins(updated.secretWordWins ?? 1);
    setRouletteSpins(spins);
    setRouletteOpen(true);
  }, [phase, word]);

  const finishLoss = useCallback(
    (msg: string) => {
      if (phase !== "playing") return;
      setPhase("lost");
      setStatusMsg(msg);
    },
    [phase]
  );

  const registerFailed = useCallback(
    (delta: number, reasonMsg: string) => {
      setFailedShots((cur) => {
        const next = cur + delta;
        if (next >= MAX_FAILED) {
          setTimeout(() => finishLoss("💀 Out of shots — the word remains a mystery."), 0);
          return MAX_FAILED;
        }
        setStatusMsg(reasonMsg);
        return next;
      });
    },
    [finishLoss]
  );

  const fireAt = (r: number, c: number, currentBoard: BoardData, currentLetters: LetterCell[]) => {
    const key = cellKey(r, c);
    if (currentBoard.shots.has(key)) return { board: currentBoard, letters: currentLetters, hit: false, missed: false, gotLetter: false, win: false };
    const { board: nextBoard, result } = applyAttack(currentBoard, r, c);
    if (result.state === "miss") {
      return { board: nextBoard, letters: currentLetters, hit: false, missed: true, gotLetter: false, win: false };
    }
    const lc = currentLetters.find((l) => l.r === r && l.c === c);
    let nextLetters = currentLetters;
    let gotLetter = false;
    if (lc && !lc.revealed) {
      nextLetters = currentLetters.map((l) => (l.index === lc.index ? { ...l, revealed: true } : l));
      gotLetter = true;
    }
    const win = nextLetters.length > 0 && nextLetters.every((l) => l.revealed);
    return { board: nextBoard, letters: nextLetters, hit: true, missed: false, gotLetter, win };
  };

  const handleCellClick = (r: number, c: number) => {
    if (phase !== "playing") return;
    if (activePower === "precision") {
      const remaining: Array<[number, number]> = [];
      for (const ship of board.ships) {
        if (ship.sunk) continue;
        for (const [sr, sc] of shipCells(ship)) {
          const k = cellKey(sr, sc);
          const st = board.shots.get(k);
          if (st !== "hit" && st !== "sunk") remaining.push([sr, sc]);
        }
      }
      if (remaining.length === 0) {
        setStatusMsg("All ship cells already exposed.");
        setActivePower(null);
        return;
      }
      if (!consumePower("precision").ok) {
        setActivePower(null);
        return;
      }
      const [tr, tc] = remaining[Math.floor(Math.random() * remaining.length)];
      const out = fireAt(tr, tc, board, letters);
      setBoard(out.board);
      setLetters(out.letters);
      setActivePower(null);
      setStatusMsg(out.gotLetter ? `🎯 Precision strike — letter revealed!` : `🎯 Precision strike at ${labelOf(tr, tc)}.`);
      if (out.win) setTimeout(finishWin, 280);
      return;
    }
    if (activePower === "airstrike") {
      const cells: Array<[number, number]> = [];
      if (airstrikeDir === "H") for (let i = 0; i < 3; i++) cells.push([r, c + i]);
      else for (let i = 0; i < 3; i++) cells.push([r + i, c]);
      const inBounds = cells.every(([cr, cc]) => cr >= 0 && cr < BOARD_SIZE && cc >= 0 && cc < BOARD_SIZE);
      if (!inBounds) {
        setStatusMsg("Airstrike out of bounds.");
        return;
      }
      if (!consumePower("airstrike").ok) {
        setActivePower(null);
        return;
      }
      let curBoard = board;
      let curLetters = letters;
      let lettersRevealed = 0;
      let totalMissed = 0;
      let didWin = false;
      for (const [cr, cc] of cells) {
        const out = fireAt(cr, cc, curBoard, curLetters);
        curBoard = out.board;
        curLetters = out.letters;
        if (out.gotLetter) lettersRevealed += 1;
        if (out.missed) totalMissed += 1;
        if (out.win) didWin = true;
      }
      setBoard(curBoard);
      setLetters(curLetters);
      setActivePower(null);
      const msg = `💣 Airstrike — ${lettersRevealed} letter${lettersRevealed === 1 ? "" : "s"} revealed${totalMissed ? `, ${totalMissed} miss${totalMissed === 1 ? "" : "es"}` : ""}.`;
      if (totalMissed > 0) {
        registerFailed(totalMissed, msg);
      } else {
        setStatusMsg(msg);
      }
      if (didWin) setTimeout(finishWin, 280);
      return;
    }
    if (activePower === "radar") {
      const sr = Math.min(Math.max(r, 0), BOARD_SIZE - 2);
      const sc = Math.min(Math.max(c, 0), BOARD_SIZE - 2);
      const cells: Array<[number, number]> = [];
      for (let dr = 0; dr < 2; dr++) for (let dc = 0; dc < 2; dc++) cells.push([sr + dr, sc + dc]);
      if (!consumePower("radar").ok) {
        setActivePower(null);
        return;
      }
      setScanned((cur) => {
        const set = new Set(cur.map(([rr, cc]) => cellKey(rr, cc)));
        const out = [...cur];
        for (const [rr, cc] of cells) {
          const k = cellKey(rr, cc);
          if (!set.has(k)) {
            set.add(k);
            out.push([rr, cc]);
          }
        }
        return out;
      });
      setActivePower(null);
      setStatusMsg("🔍 Radar pulse — sectors revealed.");
      return;
    }
    const out = fireAt(r, c, board, letters);
    if (out.missed) {
      setBoard(out.board);
      registerFailed(1, "Miss — depth charge wasted.");
      return;
    }
    setBoard(out.board);
    setLetters(out.letters);
    if (out.gotLetter) {
      const ch = letters.find((l) => l.r === r && l.c === c)?.letter ?? "";
      setStatusMsg(`🎯 Letter revealed: ${ch}`);
    } else if (out.hit) {
      setStatusMsg("💥 Direct hit — but no letter on that cell.");
    }
    if (out.win) setTimeout(finishWin, 280);
  };

  const handleSelectPower = (type: PowerType) => {
    if (phase !== "playing") return;
    if (type === "shield" || type === "smokescreen" || type === "double") return;
    setActivePower((cur) => (cur === type ? null : type));
  };

  const handleSubmitGuess = () => {
    if (phase !== "playing") return;
    const guess = guessInput.trim().toUpperCase();
    if (!guess) return;
    if (guessesLeft <= 0) return;
    setGuessInput("");
    if (guess === word) {
      setLetters((cur) => cur.map((l) => ({ ...l, revealed: true })));
      setStatusMsg("✅ Correct! You cracked the cipher.");
      setTimeout(finishWin, 280);
      return;
    }
    const remaining = guessesLeft - 1;
    setGuessesLeft(remaining);
    if (remaining <= 0) {
      finishLoss("💀 Game Over! No guesses left.");
      return;
    }
    // Wrong but still has another chance: -3 from failed shot allowance.
    setToast(`❌ Wrong! ${remaining} attempt remaining`);
    registerFailed(3, `❌ Wrong guess — ${remaining} attempt remaining · −3 failed shots`);
  };

  const guessDisabled = phase !== "playing" || guessesLeft <= 0;

  const onRouletteAwarded = useCallback((awards: AppliedAward[]) => {
    setRouletteAwards(awards);
  }, []);

  const onRouletteClose = useCallback(() => {
    setRouletteOpen(false);
  }, []);

  return (
    <div className="grid gap-4 sm:gap-5 relative min-w-0">
      <AnimatePresence>
        {toast && (
          <motion.div
            key="sw-toast"
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            className="fixed top-20 left-1/2 -translate-x-1/2 z-50 glass neon-border rounded-2xl px-5 py-3 font-bold"
            style={{ color: "#ff4d6d", textShadow: "0 0 10px #ff4d6d" }}
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      <SecretHud
        word={word}
        letters={letters}
        failedRemaining={failedRemaining}
        failedShots={failedShots}
        guessesLeft={guessesLeft}
        statusMsg={statusMsg}
        phase={phase}
      />

      <div className="grid xl:grid-cols-[1fr_360px] gap-4 sm:gap-6 min-w-0">
        <div className="flex flex-col gap-3 min-w-0">
          <div className="overflow-x-auto -mx-1 px-1">
            <Board
              board={board}
              revealShips={phase !== "playing"}
              onCellClick={handleCellClick}
              disabled={phase !== "playing"}
              label={
                activePower === "precision"
                  ? "🎯 Precision armed — click to strike"
                  : activePower === "airstrike"
                    ? `💣 Airstrike armed (${airstrikeDir === "H" ? "→" : "↓"}) — click anchor cell`
                    : activePower === "radar"
                      ? "🔍 Radar armed — click top-left of 2x2"
                      : "Hidden waters · Each hit may reveal a letter"
              }
              scannedCells={scanned}
            />
          </div>
          <PowerBar
            activePower={activePower}
            onSelect={handleSelectPower}
            disabled={phase !== "playing"}
          />
          {activePower === "airstrike" && (
            <div className="flex justify-end items-center gap-2">
              <span className="text-[11px] text-fg-dim">Airstrike direction:</span>
              <button
                onClick={() => setAirstrikeDir((d) => (d === "H" ? "V" : "H"))}
                className="rounded-lg px-3 py-1.5 text-xs font-bold border border-white/15 hover:bg-white/5"
                style={{ color: "#f97316", textShadow: "0 0 8px #f97316" }}
              >
                {airstrikeDir === "H" ? "→ Horizontal" : "↓ Vertical"} (toggle)
              </button>
            </div>
          )}
        </div>
        <aside className="grid gap-4 content-start">
          <div className="glass rounded-2xl p-4">
            <div className="text-[10px] uppercase tracking-[0.3em] text-fg-dim">Submit a guess</div>
            <p className="text-xs text-fg-dim mt-1">
              Track the letters you uncover and assemble the word. Wrong guess costs 3 from the failed shot allowance. Two wrong guesses ends the run.
            </p>
            <div className="flex gap-2 mt-3 min-w-0">
              <input
                value={guessInput}
                onChange={(e) => setGuessInput(e.target.value.toUpperCase().slice(0, 12))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSubmitGuess();
                }}
                placeholder="Type your guess"
                disabled={guessDisabled}
                maxLength={12}
                className={clsx(
                  "flex-1 min-w-0 rounded-xl bg-black/40 border border-white/15 px-3 py-2 text-sm font-mono tracking-[0.2em] min-h-[44px]",
                  guessDisabled && "opacity-60"
                )}
              />
              <button
                onClick={handleSubmitGuess}
                disabled={guessDisabled || !guessInput.trim()}
                className={clsx(
                  "rounded-xl px-3 py-2 text-sm font-semibold whitespace-nowrap min-h-[44px]",
                  guessDisabled || !guessInput.trim()
                    ? "border border-white/15 text-fg-dim cursor-not-allowed"
                    : "neon-btn"
                )}
              >
                Decode
              </button>
            </div>
            <div className="text-[11px] text-fg-dim mt-2">
              Word Guesses: <span className="font-bold tabular-nums" style={{ color: "var(--accent)" }}>{guessesLeft}/{MAX_GUESSES}</span> remaining
            </div>
          </div>

          <div className="glass rounded-2xl p-4">
            <div className="text-[10px] uppercase tracking-[0.3em] text-fg-dim">Mission rules</div>
            <ul className="text-xs text-fg-dim mt-2 grid gap-1 list-disc list-inside">
              <li>The word is fully secret — length and order are hidden.</li>
              <li>Hits on letter cells add the letter to your pool.</li>
              <li>Write the letters down and assemble the word yourself.</li>
              <li>Submit your guess — only a match reveals the word.</li>
              <li>Misses use up your 35 failed shots.</li>
              <li>Two wrong guesses = mission failed.</li>
              <li>Win to spin the roulette for a battle power.</li>
            </ul>
          </div>

          {(phase === "won" || phase === "lost") && (
            <div className="glass neon-border rounded-2xl p-4 grid gap-3">
              <div className="text-sm font-bold">
                {phase === "won" ? "🏆 Word Decoded" : "💀 Mission Failed"}
              </div>
              <div className="text-xs text-fg-dim">
                The word was <span className="font-mono font-bold" style={{ color: "var(--accent)" }}>{word}</span>.
              </div>
              {rouletteAwards && (
                <div className="text-xs text-fg-dim">
                  Loot stashed in your arsenal — use it in any battle.
                </div>
              )}
              <button
                onClick={onExit}
                className="neon-btn rounded-xl px-4 py-3 font-semibold mt-1"
              >
                Back to mission control
              </button>
            </div>
          )}
        </aside>
      </div>

      <RouletteWheel
        open={rouletteOpen}
        spins={rouletteSpins}
        onAwarded={onRouletteAwarded}
        onClose={onRouletteClose}
      />
    </div>
  );
}

function SecretHud({
  word,
  letters,
  failedRemaining,
  failedShots,
  guessesLeft,
  statusMsg,
  phase,
}: {
  word: string;
  letters: LetterCell[];
  failedRemaining: number;
  failedShots: number;
  guessesLeft: number;
  statusMsg: string;
  phase: Phase;
}) {
  // Found letters as an alphabetical pool — no position info leaked.
  const foundLetters = useMemo(
    () =>
      letters
        .filter((l) => l.revealed)
        .map((l) => l.letter)
        .sort(),
    [letters]
  );

  const lowFails = failedRemaining <= 4;

  return (
    <div className="glass neon-border rounded-3xl p-3 sm:p-5 grid gap-3 sm:gap-5 relative overflow-hidden min-w-0">
      <motion.div
        aria-hidden
        className="absolute -top-20 -right-20 w-64 h-64 rounded-full pointer-events-none"
        style={{
          background:
            "radial-gradient(circle, color-mix(in oklab, #14b8a6 35%, transparent), transparent 70%)",
        }}
        animate={{ scale: [1, 1.18, 1] }}
        transition={{ duration: 9, repeat: Infinity }}
      />
      <div className="relative z-10 flex flex-wrap items-center gap-2 sm:gap-4 min-w-0">
        <Pill label="Mode" value="Secret Word" accent="#14b8a6" />
        <Pill
          label="Failed shots"
          value={`${failedShots} / ${MAX_FAILED}`}
          accent={lowFails ? "var(--accent-2)" : "var(--accent)"}
        />
        <Pill
          label="Guesses"
          value={`${guessesLeft}/${2}`}
          accent={guessesLeft <= 1 ? "var(--accent-2)" : "var(--accent-3)"}
        />
        <div className="flex-1 basis-full sm:basis-auto min-w-0 text-xs sm:text-sm text-fg-dim text-left sm:text-right break-words">
          {statusMsg}
        </div>
      </div>

      <div className="relative z-10">
        <div className="text-[10px] uppercase tracking-[0.3em] text-fg-dim text-center">
          Letters Found ({foundLetters.length})
        </div>
        <div className="flex justify-center gap-1 sm:gap-2 mt-2 flex-wrap min-h-[40px] sm:min-h-[64px]">
          {phase !== "playing" ? (
            <div
              className="font-mono font-extrabold text-lg sm:text-3xl tracking-[0.3em]"
              style={{ color: "var(--accent)", textShadow: "0 0 14px var(--accent)" }}
            >
              {word}
            </div>
          ) : foundLetters.length === 0 ? (
            <div className="text-xs sm:text-sm text-fg-dim italic self-center">
              Hit ship cells to uncover letters — write them down and decode the word.
            </div>
          ) : (
            foundLetters.map((ch, i) => (
              <motion.div
                key={`${ch}-${i}`}
                initial={{ scale: 1.4, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.4 }}
                className="w-7 h-10 sm:w-12 sm:h-16 rounded-xl border border-accent/60 bg-accent/10 grid place-items-center font-mono font-extrabold text-lg sm:text-3xl"
                style={{ color: "var(--accent)", textShadow: "0 0 14px var(--accent)" }}
              >
                {ch}
              </motion.div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function Pill({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-xl px-2.5 py-1.5 sm:px-3 sm:py-2 border border-white/10 bg-black/30 min-w-0 max-w-full">
      <div className="text-[9px] sm:text-[10px] uppercase tracking-[0.25em] sm:tracking-[0.3em] text-fg-dim truncate">{label}</div>
      <div
        className="font-bold tabular-nums leading-tight truncate text-sm sm:text-base"
        style={{ color: accent, textShadow: `0 0 8px ${accent}` }}
      >
        {value}
      </div>
    </div>
  );
}
