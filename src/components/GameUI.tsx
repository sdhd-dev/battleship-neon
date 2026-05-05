"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import clsx from "clsx";
import {
  BOARD_SIZE,
  Board as BoardData,
  Difficulty,
  GameRecord,
  Mode,
  SHIP_DEFS,
  Ship,
  cellKey,
  shipCells,
} from "@/lib/game/types";
import { allSunk, applyAttack, autoPlace, emptyBoard } from "@/lib/game/board";
import { AIState, aiNextMove, createAIState, recordAIShot } from "@/lib/game/ai";
import { CoachReport, analyzeGame } from "@/lib/game/coach";
import { Board } from "./Board";
import { ShipPlacement } from "./ShipPlacement";
import { CoachPanel } from "./CoachPanel";
import { useAuth } from "./AuthProvider";
import { recordGame, loadStats } from "@/lib/storage";
import { supabaseEnabled } from "@/lib/supabase/client";
import { createRoom, getCurrentPlayerId } from "@/lib/game/multiplayer";
import { createTeamRoom, fetchTeamRoomByCode, joinTeamRoomByCode } from "@/lib/team-battle";
import { applyWinReward, ApplyRewardResult, spendCoins } from "@/lib/economy";
import { RewardSummary } from "./RewardSummary";
import { TrainingMode } from "./TrainingMode";
import { TipOfTheDay } from "./TipOfTheDay";
import { SecretWordMode } from "./SecretWordMode";
import { loadProfile } from "@/lib/storage";
import { PowerBar } from "./PowerBar";
import { PowerType, consumePower } from "@/lib/powers";

type Phase = "menu" | "placing" | "playing" | "over" | "training" | "secret";

const SECRET_WORD_COST = 30;
type Turn = "player" | "ai";

interface GameUIProps {
  onStatsUpdated: () => void;
}

const BLITZ_MS = 3 * 60 * 1000;

const DIFFICULTY_DESC: Record<Difficulty, { title: string; sub: string; color: string }> = {
  easy: { title: "Cadet", sub: "Random shots — perfect to learn the ropes.", color: "var(--accent)" },
  medium: { title: "Officer", sub: "Hunts neighbors after a hit and walks the line.", color: "var(--accent-3)" },
  hard: {
    title: "Admiral",
    sub: "Probability-density targeting. Treats your fleet like an equation.",
    color: "var(--accent-2)",
  },
};

export function GameUI({ onStatsUpdated }: GameUIProps) {
  const [phase, setPhase] = useState<Phase>("menu");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [mode, setMode] = useState<Mode>("classic");
  const [playerShips, setPlayerShips] = useState<Ship[]>([]);
  const [playerBoard, setPlayerBoard] = useState<BoardData>(emptyBoard());
  const [aiBoard, setAiBoard] = useState<BoardData>(emptyBoard());
  const [aiState, setAIState] = useState<AIState>(() => createAIState("medium", SHIP_DEFS.map((d) => d.length)));
  const [turn, setTurn] = useState<Turn>("player");
  const [winner, setWinner] = useState<"player" | "ai" | null>(null);
  const [shotsFired, setShotsFired] = useState(0);
  const [shotsHit, setShotsHit] = useState(0);
  const [report, setReport] = useState<CoachReport | null>(null);
  const [rewardResult, setRewardResult] = useState<ApplyRewardResult | null>(null);
  const [statusMsg, setStatusMsg] = useState<string>("Standing by.");
  const [aiThinking, setAiThinking] = useState(false);
  const [startedAt, setStartedAt] = useState(0);
  const [now, setNow] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [activePower, setActivePower] = useState<PowerType | null>(null);
  const [airstrikeDir, setAirstrikeDir] = useState<"H" | "V">("H");
  const [pendingShield, setPendingShield] = useState(false);
  const [smokeCells, setSmokeCells] = useState<Set<string>>(new Set());
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [smokeTurns, setSmokeTurns] = useState(0);
  const [scannedCells, setScannedCells] = useState<Array<[number, number]>>([]);
  const [retreatConfirm, setRetreatConfirm] = useState(false);
  const gameRecorded = useRef(false);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(id);
  }, [toast]);

  const handleTrainingExit = useCallback((completed: boolean, rewarded: boolean) => {
    setPhase("menu");
    if (completed && rewarded) setToast("🎓 +25 coins earned!");
  }, []);

  const handleStartSecretWord = useCallback(() => {
    const balance = loadProfile().coins ?? 0;
    if (balance < SECRET_WORD_COST) {
      setToast(`💰 Insufficient coins · need ${SECRET_WORD_COST} ⚓`);
      return;
    }
    const res = spendCoins(SECRET_WORD_COST);
    if (!res.ok) {
      setToast(`💰 Insufficient coins · need ${SECRET_WORD_COST} ⚓`);
      return;
    }
    onStatsUpdated();
    setPhase("secret");
  }, [onStatsUpdated]);

  const handleSecretExit = useCallback(() => {
    setPhase("menu");
    onStatsUpdated();
  }, [onStatsUpdated]);

  // Tick clock for blitz
  useEffect(() => {
    if (phase !== "playing" || mode !== "blitz") return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [phase, mode]);

  const blitzRemaining =
    mode !== "blitz" || phase !== "playing" ? BLITZ_MS : Math.max(0, BLITZ_MS - (now - startedAt));

  const startSetup = (m: Mode, d: Difficulty) => {
    setMode(m);
    setDifficulty(d);
    setPlayerShips([]);
    setPhase("placing");
  };

  const beginGame = useCallback(() => {
    const aiShips = autoPlace();
    setAiBoard({ ships: aiShips, shots: new Map() });
    setPlayerBoard({ ships: playerShips, shots: new Map() });
    setAIState(createAIState(difficulty, SHIP_DEFS.map((d) => d.length)));
    setTurn("player");
    setWinner(null);
    setShotsFired(0);
    setShotsHit(0);
    setReport(null);
    setActivePower(null);
    setPendingShield(false);
    setSmokeCells(new Set());
    setSmokeTurns(0);
    setScannedCells([]);
    gameRecorded.current = false;
    setStatusMsg("Battle commenced. Take your shot.");
    const t = Date.now();
    setStartedAt(t);
    setNow(t);
    setPhase("playing");
  }, [difficulty, playerShips]);

  const finishGame = useCallback(
    (winningSide: "player" | "ai", message: string) => {
      if (gameRecorded.current) return;
      gameRecorded.current = true;
      setWinner(winningSide);
      setStatusMsg(message);
      const durationMs = Date.now() - startedAt;
      const record: GameRecord = {
        id: `g_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        date: Date.now(),
        result: winningSide === "player" ? "win" : "loss",
        difficulty,
        mode,
        shotsFired,
        shotsHit,
        durationMs,
      };
      // AI matches stay local: they award coins/XP but do not affect the
      // weekly tournament or the cloud all-time leaderboard. Only PvP wins
      // (1v1 online + 3v3 team battle) push to those.
      recordGame(loadStats(), record);

      if (winningSide === "player") {
        const perfect = shotsFired > 0 && shotsHit === shotsFired;
        const result = applyWinReward({
          difficulty,
          mode,
          perfect,
          isPvp: false,
        });
        setRewardResult(result);
      } else {
        setRewardResult(null);
      }

      onStatsUpdated();

      const enemyBoardForAnalysis: BoardData = {
        ships: aiBoard.ships,
        shots: playerBoard.shots,
      };
      const r = analyzeGame({
        playerShots: playerBoard.shots,
        enemyBoard: enemyBoardForAnalysis,
        result: record.result,
        difficulty,
        durationMs,
      });
      setReport(r);
      setPhase("over");
    },
    [aiBoard.ships, difficulty, mode, onStatsUpdated, playerBoard.shots, shotsFired, shotsHit, startedAt]
  );

  // Auto-end blitz on timeout
  useEffect(() => {
    if (mode !== "blitz" || phase !== "playing") return;
    if (blitzRemaining <= 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      finishGame("ai", "⏱ Time up — your blitz expired.");
    }
  }, [blitzRemaining, mode, phase, finishGame]);

  const fireSingleShot = (r: number, c: number) => {
    const k = cellKey(r, c);
    if (aiBoard.shots.has(k)) return;
    const { board: nextBoard, result } = applyAttack(aiBoard, r, c);
    setAiBoard(nextBoard);
    setShotsFired((n) => n + 1);
    if (result.state === "hit" || result.state === "sunk") {
      setShotsHit((n) => n + 1);
      setStatusMsg(result.state === "sunk" ? `⚓ You sank their ${result.sunkShip?.type}!` : "🎯 Direct hit! Keep firing.");
      if (result.win) {
        finishGame("player", "🏆 Enemy fleet annihilated.");
        return;
      }
      scheduleAIMove();
    } else {
      setStatusMsg("Miss — handing the controls to the enemy.");
      scheduleAIMove();
    }
  };

  const handleEnemyCellClick = (r: number, c: number) => {
    if (phase !== "playing" || turn !== "player" || winner) return;
    if (activePower === "precision") {
      const remaining: Array<[number, number]> = [];
      for (const ship of aiBoard.ships) {
        if (ship.sunk) continue;
        for (const [sr, sc] of shipCells(ship)) {
          const k = cellKey(sr, sc);
          const st = aiBoard.shots.get(k);
          if (st !== "hit" && st !== "sunk") remaining.push([sr, sc]);
        }
      }
      if (remaining.length === 0) {
        setStatusMsg("No targets remain — precision strike cancelled.");
        setActivePower(null);
        return;
      }
      if (!consumePower("precision").ok) {
        setActivePower(null);
        return;
      }
      const [tr, tc] = pickRandom(remaining);
      const { board: nextBoard, result } = applyAttack(aiBoard, tr, tc);
      setAiBoard(nextBoard);
      setShotsFired((n) => n + 1);
      setShotsHit((n) => n + 1);
      setActivePower(null);
      setStatusMsg(`🎯 Precision strike — ${labelOf(tr, tc)} hit!`);
      if (result.win) {
        finishGame("player", "🏆 Enemy fleet annihilated.");
        return;
      }
      scheduleAIMove();
      return;
    }
    if (activePower === "airstrike") {
      const cells: Array<[number, number]> = [];
      if (airstrikeDir === "H") {
        for (let i = 0; i < 3; i++) cells.push([r, c + i]);
      } else {
        for (let i = 0; i < 3; i++) cells.push([r + i, c]);
      }
      const inBounds = cells.every(([cr, cc]) => cr >= 0 && cr < BOARD_SIZE && cc >= 0 && cc < BOARD_SIZE);
      if (!inBounds) {
        setStatusMsg("Airstrike out of bounds — pick a cell with room for 3 in a row.");
        return;
      }
      if (!consumePower("airstrike").ok) {
        setActivePower(null);
        return;
      }
      let board = aiBoard;
      let hits = 0;
      let fired = 0;
      let didWin = false;
      for (const [cr, cc] of cells) {
        const k = cellKey(cr, cc);
        if (board.shots.has(k)) continue;
        const { board: next, result } = applyAttack(board, cr, cc);
        board = next;
        fired += 1;
        if (result.state === "hit" || result.state === "sunk") hits += 1;
        if (result.win) didWin = true;
      }
      setAiBoard(board);
      setShotsFired((n) => n + fired);
      setShotsHit((n) => n + hits);
      setActivePower(null);
      setStatusMsg(`💣 Airstrike — ${hits}/${fired || 3} hits.`);
      if (didWin) {
        finishGame("player", "🏆 Enemy fleet annihilated.");
        return;
      }
      scheduleAIMove();
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
      setScannedCells((cur) => mergeCells(cur, cells));
      setActivePower(null);
      setStatusMsg("🔍 Radar pulse — sectors revealed.");
      return;
    }
    fireSingleShot(r, c);
  };

  const handlePlayerBoardClick = (r: number, c: number) => {
    if (phase !== "playing" || turn !== "player" || winner) return;
    if (activePower !== "smokescreen") return;
    const sr = Math.min(Math.max(r - 1, 0), BOARD_SIZE - 3);
    const sc = Math.min(Math.max(c - 1, 0), BOARD_SIZE - 3);
    const next = new Set<string>();
    for (let dr = 0; dr < 3; dr++) for (let dc = 0; dc < 3; dc++) next.add(cellKey(sr + dr, sc + dc));
    if (!consumePower("smokescreen").ok) {
      setActivePower(null);
      return;
    }
    setSmokeCells(next);
    setSmokeTurns(2);
    setActivePower(null);
    setStatusMsg("💨 Smokescreen deployed — 3x3 cloaked for 2 enemy turns.");
  };

  const handleSelectPower = (type: PowerType) => {
    if (phase !== "playing" || turn !== "player" || winner) return;
    if (type === "shield") {
      if (pendingShield) return;
      if (!consumePower("shield").ok) return;
      setPendingShield(true);
      setStatusMsg("🛡️ Shield armed — next enemy strike will glance off.");
      return;
    }
    if (type === "double") return;
    setActivePower((cur) => (cur === type ? null : type));
  };

  const scheduleAIMove = useCallback(() => {
    setTurn("ai");
    setAiThinking(true);
  }, []);

  // AI turn effect
  useEffect(() => {
    if (phase !== "playing" || turn !== "ai" || winner) return;
    let cancelled = false;
    const delay = 700 + Math.random() * 600;
    const timer = setTimeout(() => {
      if (cancelled) return;
      const [r, c] = aiNextMove(aiState);
      const k = cellKey(r, c);
      const blockedByShield = pendingShield;
      const blockedBySmoke = !blockedByShield && smokeCells.has(k);
      if (blockedByShield || blockedBySmoke) {
        const newShots = new Map(playerBoard.shots);
        newShots.set(k, "miss");
        const nextBoard: BoardData = { ...playerBoard, shots: newShots };
        setPlayerBoard(nextBoard);
        setAIState((prev) => recordAIShot(prev, r, c, "miss", undefined));
        if (blockedByShield) {
          setPendingShield(false);
          setStatusMsg(`🛡️ Shield deflected the strike at ${labelOf(r, c)}.`);
        } else {
          setStatusMsg(`💨 Smokescreen — enemy lost the shot at ${labelOf(r, c)}.`);
        }
        setSmokeTurns((t) => {
          if (t <= 0) return t;
          const next = t - 1;
          if (next <= 0) setSmokeCells(new Set());
          return next;
        });
        setAiThinking(false);
        setTurn("player");
        return;
      }
      const { board: nextPlayerBoard, result } = applyAttack(playerBoard, r, c);
      setPlayerBoard(nextPlayerBoard);
      setAIState((prev) => recordAIShot(prev, r, c, result.state, result.sunkShip));
      if (result.state === "hit") {
        setStatusMsg(`💥 The enemy hit ${labelOf(r, c)}.`);
      } else if (result.state === "sunk") {
        setStatusMsg(`☠ The enemy sank your ${result.sunkShip?.type}.`);
      } else {
        setStatusMsg(`The enemy missed at ${labelOf(r, c)}. Your turn.`);
      }
      setSmokeTurns((t) => {
        if (t <= 0) return t;
        const next = t - 1;
        if (next <= 0) setSmokeCells(new Set());
        return next;
      });
      setAiThinking(false);
      if (allSunk(nextPlayerBoard)) {
        finishGame("ai", "💀 Your fleet has been annihilated.");
      } else {
        setTurn("player");
      }
    }, delay);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [aiState, finishGame, phase, playerBoard, pendingShield, smokeCells, turn, winner]);

  const reset = () => {
    setPhase("menu");
    setReport(null);
    setRewardResult(null);
    setPlayerShips([]);
    setPlayerBoard(emptyBoard());
    setAiBoard(emptyBoard());
  };

  return (
    <div className="relative">
      <AnimatePresence>
        {toast && (
          <motion.div
            key="training-toast"
            initial={{ opacity: 0, y: -16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 260, damping: 22 }}
            className="fixed top-20 left-1/2 -translate-x-1/2 z-50 glass neon-border rounded-2xl px-5 py-3 font-bold flex items-center gap-2"
            style={{ color: "#fbbf24", textShadow: "0 0 10px #fbbf24" }}
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence mode="wait">
        {phase === "menu" && (
          <motion.div
            key="menu"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="grid gap-6"
          >
            <Hero />
            <TipOfTheDay />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
              <TrainingCard onPick={() => setPhase("training")} />
              <SecretWordCard onPick={handleStartSecretWord} />
              <PlayOnlineCard />
              <TeamBattleCard />
              <ModeCard
                title="Classic"
                tag="No timer · vs AI"
                desc="Hunt at your own pace — no clock, just strategy."
                gradient="from-accent/30 via-accent-3/30 to-transparent"
                onPick={(d) => startSetup("classic", d)}
              />
              <ModeCard
                title="Blitz · 3:00"
                tag="Pressure cooker · vs AI"
                desc="Sink in three minutes. Miss the timer, lose the war."
                gradient="from-accent-2/30 via-accent/30 to-transparent"
                onPick={(d) => startSetup("blitz", d)}
              />
            </div>
          </motion.div>
        )}

        {phase === "training" && (
          <TrainingMode key="training" onExit={handleTrainingExit} />
        )}

        {phase === "secret" && (
          <motion.div
            key="secret"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            <SecretWordMode onExit={handleSecretExit} />
          </motion.div>
        )}

        {phase === "placing" && (
          <motion.div
            key="placing"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            <ShipPlacement
              ships={playerShips}
              onChange={setPlayerShips}
              onConfirm={beginGame}
              onBack={() => setPhase("menu")}
            />
          </motion.div>
        )}

        {phase === "playing" && (
          <motion.div
            key="playing"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="grid gap-5"
          >
            <BattleHUD
              difficulty={difficulty}
              mode={mode}
              blitzRemaining={blitzRemaining}
              turn={turn}
              aiThinking={aiThinking}
              shotsFired={shotsFired}
              shotsHit={shotsHit}
              statusMsg={statusMsg}
            />

            <div className="grid xl:grid-cols-2 gap-6 min-w-0">
              <div className="flex flex-col gap-3 min-w-0">
                <div className="overflow-x-auto -mx-1 px-1">
                  <Board
                    board={aiBoard}
                    revealShips={false}
                    onCellClick={handleEnemyCellClick}
                    disabled={turn !== "player" || !!winner}
                    label={
                      activePower === "precision"
                        ? "🎯 Precision armed — click anywhere to strike"
                        : activePower === "airstrike"
                          ? `💣 Airstrike armed (${airstrikeDir === "H" ? "→" : "↓"}) — click leftmost cell`
                          : activePower === "radar"
                            ? "🔍 Radar armed — click top-left of 2x2 area"
                            : "Enemy Waters · Click to fire"
                    }
                    scannedCells={scannedCells}
                  />
                </div>
                <ShipStatus title="Enemy Fleet" ships={aiBoard.ships} />
              </div>
              <div className="flex flex-col gap-3 min-w-0">
                <div className="overflow-x-auto -mx-1 px-1">
                  <Board
                    board={playerBoard}
                    revealShips
                    label={
                      activePower === "smokescreen"
                        ? "💨 Smokescreen armed — click center of 3x3 zone"
                        : "Your Fleet · Incoming fire"
                    }
                    compact
                    onCellClick={activePower === "smokescreen" ? handlePlayerBoardClick : undefined}
                    disabled={activePower !== "smokescreen"}
                    smokedCells={Array.from(smokeCells).map((k) => {
                      const [rs, cs] = k.split(",").map(Number);
                      return [rs, cs] as [number, number];
                    })}
                  />
                </div>
                <ShipStatus title="Your Fleet" ships={playerBoard.ships} reveal />
              </div>
            </div>

            <PowerBar
              activePower={activePower}
              onSelect={handleSelectPower}
              disabled={turn !== "player" || !!winner}
              isPowerDisabled={(t) => (t === "shield" && pendingShield)}
            />
            {activePower === "airstrike" && (
              <div className="flex justify-end items-center gap-2 -mt-2">
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
            {pendingShield && (
              <div className="flex justify-end -mt-2">
                <span
                  className="rounded-full px-3 py-1 text-[11px] font-bold border border-emerald-300/40"
                  style={{ color: "#34d399", textShadow: "0 0 8px #34d399" }}
                >
                  🛡️ Shield queued
                </span>
              </div>
            )}

            <div className="flex justify-end">
              <button
                onClick={() => setRetreatConfirm(true)}
                className="group relative rounded-xl px-4 py-2 text-sm font-bold border border-rose-400/40 hover:border-rose-300/70 transition-all overflow-hidden"
                style={{
                  background:
                    "linear-gradient(135deg, rgba(244,63,94,0.12), rgba(249,115,22,0.10))",
                  color: "#fda4af",
                  textShadow: "0 0 10px rgba(244,63,94,0.55)",
                  boxShadow: "0 0 0 1px rgba(244,63,94,0.15), 0 6px 22px rgba(244,63,94,0.18)",
                }}
              >
                <span className="relative z-10 inline-flex items-center gap-1.5">
                  <span aria-hidden>🏳</span>
                  Retreat
                </span>
                <span
                  aria-hidden
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{
                    background:
                      "linear-gradient(135deg, rgba(244,63,94,0.22), rgba(249,115,22,0.18))",
                  }}
                />
              </button>
            </div>

            <AnimatePresence>
              {retreatConfirm && (
                <motion.div
                  key="retreat-overlay"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 z-[120] grid place-items-center p-4"
                  style={{
                    background:
                      "radial-gradient(circle at 50% 50%, rgba(8,12,30,0.85), rgba(0,0,0,0.95))",
                    backdropFilter: "blur(12px)",
                  }}
                  onClick={() => setRetreatConfirm(false)}
                >
                  <motion.div
                    initial={{ scale: 0.9, opacity: 0, y: 8 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.95, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 280, damping: 24 }}
                    onClick={(e) => e.stopPropagation()}
                    className="glass neon-border rounded-3xl p-6 sm:p-8 max-w-sm w-full text-center"
                  >
                    <div className="text-5xl mb-3" aria-hidden>🏳</div>
                    <div className="text-[10px] sm:text-xs uppercase tracking-[0.4em] text-fg-dim">
                      Abandon ship
                    </div>
                    <h2 className="text-2xl sm:text-3xl font-extrabold title-grad mt-1">
                      Retreat from battle?
                    </h2>
                    <p className="mt-3 text-sm text-fg-dim">
                      The match will end and the AI will claim victory. You can
                      always set sail again from the menu.
                    </p>
                    <div className="mt-6 grid grid-cols-2 gap-3">
                      <button
                        onClick={() => setRetreatConfirm(false)}
                        className="rounded-xl px-3 py-2.5 text-sm font-bold border border-white/15 hover:bg-white/5 transition-colors"
                      >
                        Stay & fight
                      </button>
                      <button
                        onClick={() => {
                          setRetreatConfirm(false);
                          finishGame("ai", "🏳 You retreated.");
                        }}
                        className="rounded-xl px-3 py-2.5 text-sm font-extrabold border border-rose-400/50 transition-all"
                        style={{
                          background:
                            "linear-gradient(135deg, rgba(244,63,94,0.25), rgba(249,115,22,0.20))",
                          color: "#fecdd3",
                          textShadow: "0 0 10px rgba(244,63,94,0.6)",
                          boxShadow:
                            "0 0 0 1px rgba(244,63,94,0.3), 0 8px 26px rgba(244,63,94,0.25)",
                        }}
                      >
                        🏳 Retreat
                      </button>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {phase === "over" && report && (
          <motion.div
            key="over"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="grid gap-5"
          >
            {rewardResult && <RewardSummary result={rewardResult} />}
            <CoachPanel report={report} />
            <div className="grid xl:grid-cols-2 gap-6">
              <div className="flex flex-col gap-3">
                <Board board={aiBoard} revealShips label="Enemy Fleet — Revealed" />
              </div>
              <div className="flex flex-col gap-3">
                <Board board={playerBoard} revealShips label="Your Fleet" compact />
              </div>
            </div>
            <div className="flex flex-wrap gap-3 justify-end">
              <button onClick={reset} className="rounded-xl px-4 py-3 border border-white/15 hover:bg-white/5">
                Main menu
              </button>
              <button
                onClick={() => startSetup(mode, difficulty)}
                className="neon-btn rounded-xl px-4 py-3 font-semibold pulse-glow"
              >
                Rematch ({difficulty} · {mode})
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Hero() {
  return (
    <div className="glass neon-border rounded-2xl sm:rounded-3xl p-5 sm:p-10 relative overflow-hidden">
      <motion.div
        className="absolute -top-32 -right-32 w-96 h-96 rounded-full"
        style={{ background: "radial-gradient(circle, color-mix(in oklab, var(--accent-2) 35%, transparent), transparent 70%)" }}
        animate={{ scale: [1, 1.15, 1], rotate: [0, 30, 0] }}
        transition={{ duration: 14, repeat: Infinity }}
      />
      <motion.div
        className="absolute -bottom-32 -left-20 w-80 h-80 rounded-full"
        style={{ background: "radial-gradient(circle, color-mix(in oklab, var(--accent) 30%, transparent), transparent 70%)" }}
        animate={{ scale: [1, 1.2, 1], rotate: [0, -25, 0] }}
        transition={{ duration: 16, repeat: Infinity }}
      />
      <div className="relative z-10 max-w-2xl">
        <div className="text-[10px] sm:text-xs uppercase tracking-[0.4em] text-fg-dim">Mission Control</div>
        <h1 className="text-3xl sm:text-6xl font-extrabold leading-tight sm:leading-none mt-2 title-grad break-words">Sink. Hunt. Conquer.</h1>
        <p className="text-fg-dim mt-3 text-sm sm:text-lg max-w-xl break-words">
          A modern Battleship arena with three AI commanders, a 3-minute blitz, and an after-action coach that scores your strategy.
        </p>
      </div>
    </div>
  );
}

function SecretWordCard({ onPick }: { onPick: () => void }) {
  return (
    <motion.button
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.98 }}
      onClick={onPick}
      className="glass neon-border rounded-2xl sm:rounded-3xl p-5 sm:p-6 relative overflow-hidden text-left h-full flex w-full min-h-[44px]"
      style={{
        boxShadow:
          "0 0 0 1px color-mix(in oklab, #14b8a6 60%, transparent), 0 0 22px color-mix(in oklab, #14b8a6 35%, transparent), inset 0 0 18px color-mix(in oklab, #064e3b 40%, transparent)",
      }}
    >
      <motion.div
        className="absolute -top-20 -right-20 w-56 h-56 rounded-full pointer-events-none"
        style={{
          background:
            "radial-gradient(circle, color-mix(in oklab, #14b8a6 40%, transparent), transparent 70%)",
        }}
        animate={{ scale: [1, 1.2, 1] }}
        transition={{ duration: 7, repeat: Infinity }}
      />
      <div
        className="absolute top-3 right-3 rounded-full px-2 py-1 text-[10px] font-bold border z-10"
        style={{
          color: "#fbbf24",
          textShadow: "0 0 8px #fbbf24",
          borderColor: "rgba(251,191,36,0.5)",
          background: "rgba(251,191,36,0.12)",
        }}
      >
        💰 30 ⚓
      </div>
      <div className="relative z-10 flex flex-col flex-1 gap-2 min-w-0">
        <div className="text-[10px] uppercase tracking-[0.4em] text-fg-dim">
          Premium · Word hunt
        </div>
        <h3
          className="text-2xl sm:text-3xl font-extrabold flex items-center gap-2 break-words"
          style={{ color: "#5eead4", textShadow: "0 0 12px #14b8a6" }}
        >
          <span className="text-2xl sm:text-3xl">🔤</span> Secret Word
        </h3>
        <p className="text-fg-dim text-sm break-words">
          Decode the hidden word from ship cells. Win the roulette. Earn powers.
        </p>
        <div className="mt-auto pt-3">
          <span
            className="inline-block rounded-xl px-3 py-2 text-xs font-semibold border pulse-glow"
            style={{
              borderColor: "rgba(20,184,166,0.55)",
              background: "rgba(20,184,166,0.12)",
              color: "#5eead4",
              textShadow: "0 0 10px #14b8a6",
            }}
          >
            Begin mission · 30 ⚓
          </span>
        </div>
      </div>
    </motion.button>
  );
}

function TrainingCard({ onPick }: { onPick: () => void }) {
  return (
    <motion.button
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.98 }}
      onClick={onPick}
      className="glass rounded-2xl sm:rounded-3xl p-5 sm:p-6 relative overflow-hidden text-left group h-full flex w-full min-h-[44px]"
    >
      <div className="absolute inset-0 bg-gradient-to-br from-amber-300/20 via-accent/20 to-transparent pointer-events-none opacity-70" />
      <div className="relative z-10 flex flex-col flex-1 gap-2 min-w-0">
        <div className="text-[10px] uppercase tracking-[0.4em] text-fg-dim">
          New here?
        </div>
        <h3 className="text-2xl sm:text-3xl font-extrabold neon-text flex items-center gap-2 break-words">
          <span className="text-2xl sm:text-3xl">🎓</span> Training
        </h3>
        <p className="text-fg-dim text-sm break-words">
          A 5-step interactive tutorial — placement, shooting, hunt strategy. Earn the Graduate badge.
        </p>
        <div className="mt-auto pt-3">
          <span className="inline-block rounded-xl px-3 py-2 text-xs font-semibold border border-amber-300/40 bg-amber-300/10 text-amber-200">
            Reward: 🎓 badge + ⚓ 25
          </span>
        </div>
      </div>
    </motion.button>
  );
}

function ModeCard({
  title,
  tag,
  desc,
  gradient,
  onPick,
}: {
  title: string;
  tag: string;
  desc: string;
  gradient: string;
  onPick: (d: Difficulty) => void;
}) {
  return (
    <div className="glass rounded-2xl sm:rounded-3xl p-5 sm:p-6 relative overflow-hidden h-full flex w-full">
      <div className={`absolute inset-0 bg-gradient-to-br ${gradient} pointer-events-none opacity-60`} />
      <div className="relative z-10 flex flex-col flex-1 min-w-0">
        <div className="text-[10px] uppercase tracking-[0.4em] text-fg-dim">{tag}</div>
        <h3 className="text-2xl sm:text-3xl font-extrabold neon-text break-words">{title}</h3>
        <p className="text-fg-dim text-sm mt-1 break-words">{desc}</p>
        <div className="grid gap-2 mt-4">
          {(["easy", "medium", "hard"] as Difficulty[]).map((d) => (
            <motion.button
              key={d}
              whileHover={{ y: -1, x: 2 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onPick(d)}
              className="rounded-xl border border-white/10 hover:border-white/30 px-3 py-2.5 text-left bg-black/20 flex items-center gap-3 min-h-[44px]"
            >
              <div className="shrink-0 w-[88px]">
                <div className="text-[9px] uppercase tracking-[0.3em] text-fg-dim leading-tight">{d}</div>
                <div className="font-bold leading-tight" style={{ color: DIFFICULTY_DESC[d].color }}>
                  {DIFFICULTY_DESC[d].title}
                </div>
              </div>
              <div className="text-[11px] text-fg-dim leading-snug flex-1 min-w-0">
                {DIFFICULTY_DESC[d].sub}
              </div>
            </motion.button>
          ))}
        </div>
      </div>
    </div>
  );
}

function BattleHUD({
  difficulty,
  mode,
  blitzRemaining,
  turn,
  aiThinking,
  shotsFired,
  shotsHit,
  statusMsg,
}: {
  difficulty: Difficulty;
  mode: Mode;
  blitzRemaining: number;
  turn: Turn;
  aiThinking: boolean;
  shotsFired: number;
  shotsHit: number;
  statusMsg: string;
}) {
  const accuracy = shotsFired ? Math.round((shotsHit / shotsFired) * 100) : 0;
  const seconds = Math.ceil(blitzRemaining / 1000);
  const mm = Math.floor(seconds / 60);
  const ss = seconds % 60;
  const timeText = `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  const lowTime = mode === "blitz" && blitzRemaining < 30_000;

  return (
    <div className="glass rounded-3xl p-4 sm:p-5 flex flex-wrap items-center gap-4">
      <Pill label="Mode" value={mode === "blitz" ? "Blitz 3:00" : "Classic"} accent="var(--accent)" />
      <Pill label="AI" value={DIFFICULTY_DESC[difficulty].title} accent={DIFFICULTY_DESC[difficulty].color} />
      <Pill label="Shots" value={shotsFired.toString()} accent="var(--accent-3)" />
      <Pill label="Accuracy" value={`${accuracy}%`} accent="var(--accent)" />
      {mode === "blitz" && (
        <div
          className={clsx(
            "rounded-xl px-4 py-2 font-mono text-2xl font-extrabold tabular-nums",
            lowTime ? "text-accent-2 pulse-glow border border-accent-2/60" : "text-accent border border-accent/60"
          )}
          style={{ minWidth: 120, textAlign: "center" }}
        >
          {timeText}
        </div>
      )}
      <div className="flex-1 min-w-[200px] flex items-center justify-end gap-3">
        <motion.div
          key={statusMsg}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-sm text-fg-dim text-right"
        >
          {statusMsg}
        </motion.div>
        <div
          className={clsx(
            "w-3 h-3 rounded-full",
            turn === "player" ? "bg-accent shadow-[0_0_12px_var(--accent)]" : "bg-accent-2 shadow-[0_0_12px_var(--accent-2)]"
          )}
          title={turn === "player" ? "Your turn" : aiThinking ? "AI thinking..." : "AI turn"}
        />
      </div>
    </div>
  );
}

function Pill({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-xl px-3 py-2 border border-white/10 bg-black/20 min-w-[96px]">
      <div className="text-[10px] uppercase tracking-[0.3em] text-fg-dim">{label}</div>
      <div
        className="font-bold tabular-nums leading-tight truncate"
        style={{ color: accent, textShadow: `0 0 8px ${accent}` }}
      >
        {value}
      </div>
    </div>
  );
}

function ShipStatus({ title, ships, reveal }: { title: string; ships: Ship[]; reveal?: boolean }) {
  return (
    <div className="glass rounded-2xl p-3 sm:p-4">
      <div className="text-[11px] uppercase tracking-[0.3em] text-fg-dim mb-2">{title}</div>
      <div className="flex flex-wrap gap-2">
        {ships.map((s) => (
          <div
            key={s.id}
            className={clsx(
              "rounded-lg px-2.5 py-1.5 border text-xs flex items-center gap-2",
              s.sunk
                ? "border-red-500/60 bg-red-500/10 text-red-300"
                : reveal
                  ? "border-accent/40 bg-accent/10"
                  : "border-white/15 bg-white/5"
            )}
          >
            <div className="flex gap-[2px]">
              {Array.from({ length: s.length }).map((_, i) => (
                <div
                  key={i}
                  className={clsx(
                    "w-2 h-2 rounded-sm",
                    s.sunk ? "bg-red-400" : i < s.hits ? "bg-accent-2" : reveal ? "bg-accent" : "bg-white/30"
                  )}
                />
              ))}
            </div>
            <span className="capitalize">{s.type}</span>
            {s.sunk && <span className="ml-1">☠</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function labelOf(r: number, c: number) {
  return `${"ABCDEFGHIJ"[c]}${r + 1}`;
}

function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function mergeCells(
  prev: Array<[number, number]>,
  add: Array<[number, number]>
): Array<[number, number]> {
  const set = new Set(prev.map(([r, c]) => `${r},${c}`));
  const out = [...prev];
  for (const [r, c] of add) {
    const k = `${r},${c}`;
    if (!set.has(k)) {
      set.add(k);
      out.push([r, c]);
    }
  }
  return out;
}

function TeamBattleCard() {
  const router = useRouter();
  const { profile } = useAuth();
  const cloud = supabaseEnabled();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [joining, setJoining] = useState(false);

  const onCreate = async () => {
    if (!cloud) {
      setError("Team Battle requires Supabase env vars.");
      return;
    }
    if (busy) return;
    setBusy(true);
    setError(null);
    const id = await getCurrentPlayerId();
    const room = await createTeamRoom(id, profile.username || "Captain");
    if (!room) {
      setError("Could not create room. Run supabase/team_battle.sql first.");
      setBusy(false);
      return;
    }
    router.push(`/team-room/${room.room_code}`);
  };

  const onJoin = async () => {
    if (!cloud) {
      setError("Team Battle requires Supabase env vars.");
      return;
    }
    const code = joinCode.trim().toUpperCase();
    if (!code) return;
    setJoining(true);
    setError(null);
    const room = await fetchTeamRoomByCode(code);
    if (!room) {
      setError("Room not found.");
      setJoining(false);
      return;
    }
    const id = await getCurrentPlayerId();
    const res = await joinTeamRoomByCode(code, id, profile.username || "Captain");
    setJoining(false);
    if (!res.ok || !res.room) {
      setError(res.error ?? "Could not join.");
      return;
    }
    router.push(`/team-room/${res.room.room_code}`);
  };

  return (
    <div className="glass neon-border rounded-2xl sm:rounded-3xl p-5 sm:p-6 relative overflow-hidden h-full flex w-full">
      <div
        className="absolute -top-16 -left-16 w-48 h-48 rounded-full pointer-events-none"
        style={{
          background:
            "radial-gradient(circle, color-mix(in oklab, var(--accent-3) 35%, transparent), transparent 70%)",
        }}
      />
      <div className="relative z-10 flex flex-col flex-1 gap-2 min-w-0">
        <div className="text-[10px] uppercase tracking-[0.4em] text-fg-dim">
          New mode · Squad
        </div>
        <h3 className="text-2xl sm:text-3xl font-extrabold neon-text flex items-center gap-2 break-words">
          <span className="text-2xl sm:text-3xl">⚔️</span> Team Battle 3v3
        </h3>
        <p className="text-fg-dim text-sm break-words">
          Form a six-player lobby. Three vs three boards, alternating fire.
          Wipe the enemy fleet to win.
        </p>

        <div className="grid gap-2 mt-3">
          <button
            onClick={onCreate}
            disabled={!cloud || busy}
            className={clsx(
              "rounded-xl px-3 py-2.5 text-sm font-semibold border min-h-[44px]",
              cloud && !busy
                ? "neon-btn"
                : "border-white/15 bg-white/5 text-fg-dim cursor-not-allowed"
            )}
          >
            {busy ? "Creating room…" : "Create Team Room →"}
          </button>
          <div className="flex gap-2 min-w-0">
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase().slice(0, 8))}
              placeholder="ENTER CODE"
              maxLength={8}
              disabled={!cloud}
              className="flex-1 min-w-0 rounded-xl bg-black/40 border border-white/15 px-3 py-2 text-sm font-mono tracking-[0.2em] min-h-[44px]"
            />
            <button
              onClick={onJoin}
              disabled={!cloud || joining || !joinCode.trim()}
              className={clsx(
                "rounded-xl px-4 py-2 text-sm font-semibold whitespace-nowrap min-h-[44px]",
                cloud && joinCode.trim()
                  ? "neon-btn"
                  : "border border-white/15 text-fg-dim cursor-not-allowed"
              )}
            >
              {joining ? "Joining…" : "Join"}
            </button>
          </div>
          {error && <p className="text-xs text-red-300">{error}</p>}
          {!cloud && (
            <p className="text-[11px] text-fg-dim">
              Configure Supabase env vars to enable.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function PlayOnlineCard() {
  const router = useRouter();
  const { profile } = useAuth();
  const cloud = supabaseEnabled();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onPlayOnline = async () => {
    if (!cloud) {
      setError("Online play requires Supabase env vars.");
      return;
    }
    if (creating) return;
    setError(null);
    setCreating(true);
    try {
      const id = await getCurrentPlayerId();
      const room = await createRoom(id, profile.username || "Captain");
      if (!room) {
        setError("Could not create room. Run supabase/multiplayer.sql first.");
        setCreating(false);
        return;
      }
      router.push(`/room/${room.id}`);
    } catch {
      setError("Could not create room.");
      setCreating(false);
    }
  };

  return (
    <motion.button
      whileHover={cloud && !creating ? { y: -2 } : undefined}
      whileTap={cloud && !creating ? { scale: 0.98 } : undefined}
      onClick={onPlayOnline}
      disabled={creating || !cloud}
      className={clsx(
        "glass neon-border rounded-2xl sm:rounded-3xl p-5 sm:p-6 relative overflow-hidden text-left h-full flex w-full min-h-[44px]",
        (creating || !cloud) && "opacity-80 cursor-not-allowed"
      )}
    >
      <motion.div
        className="absolute -top-16 -right-16 w-48 h-48 rounded-full pointer-events-none"
        style={{
          background:
            "radial-gradient(circle, color-mix(in oklab, var(--accent-2) 35%, transparent), transparent 70%)",
        }}
        animate={{ scale: [1, 1.2, 1] }}
        transition={{ duration: 6, repeat: Infinity }}
      />
      <div className="relative z-10 flex flex-col flex-1 gap-2 min-w-0">
        <div className="text-[10px] uppercase tracking-[0.4em] text-fg-dim">
          Multiplayer · Beta
        </div>
        <h3 className="text-2xl sm:text-3xl font-extrabold neon-text flex items-center gap-2 break-words">
          <span className="text-2xl sm:text-3xl">🌐</span> Play Online
        </h3>
        <p className="text-fg-dim text-sm break-words">
          Spin up a private lobby, share the invite link, and trade salvos in real time — with chat.
        </p>
        {error && (
          <p className="text-xs text-red-300">{error}</p>
        )}
        {!cloud && (
          <p className="text-[11px] text-fg-dim">
            Configure <code>NEXT_PUBLIC_SUPABASE_URL</code> &amp;{" "}
            <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to enable.
          </p>
        )}
        <div className="mt-auto pt-3">
          <span
            className={clsx(
              "inline-block rounded-xl px-3 py-2 text-xs font-semibold border",
              cloud && !creating
                ? "border-accent-2/50 bg-accent-2/10 text-accent-2 pulse-glow"
                : "border-white/15 bg-white/5 text-fg-dim"
            )}
            style={
              cloud && !creating
                ? { color: "var(--accent-2)", textShadow: "0 0 8px var(--accent-2)" }
                : undefined
            }
          >
            {creating ? "Creating room…" : cloud ? "Create Room →" : "Unavailable"}
          </span>
        </div>
      </div>
    </motion.button>
  );
}
