"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import clsx from "clsx";
import {
  Board as BoardData,
  Difficulty,
  GameRecord,
  Mode,
  SHIP_DEFS,
  Ship,
  cellKey,
} from "@/lib/game/types";
import { allSunk, applyAttack, autoPlace, emptyBoard } from "@/lib/game/board";
import { AIState, aiNextMove, createAIState, recordAIShot } from "@/lib/game/ai";
import { CoachReport, analyzeGame } from "@/lib/game/coach";
import { Board } from "./Board";
import { ShipPlacement } from "./ShipPlacement";
import { CoachPanel } from "./CoachPanel";
import { useAuth } from "./AuthProvider";
import {
  recordGame,
  recordLocalLeaderboard,
  recordWeeklyGame,
  syncCloudLeaderboard,
  syncCloudWeeklyLeaderboard,
  loadStats,
} from "@/lib/storage";
import { supabaseEnabled } from "@/lib/supabase/client";
import { createRoom, getCurrentPlayerId } from "@/lib/game/multiplayer";
import { applyWinReward, ApplyRewardResult } from "@/lib/economy";
import { RewardSummary } from "./RewardSummary";

type Phase = "menu" | "placing" | "playing" | "over";
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
  const { profile } = useAuth();
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
  const gameRecorded = useRef(false);

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
      const { stats } = recordGame(loadStats(), record);
      recordLocalLeaderboard(profile, stats);
      syncCloudLeaderboard(profile, stats).catch(() => {});
      const weekly = recordWeeklyGame(record);
      syncCloudWeeklyLeaderboard(profile, weekly).catch(() => {});

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
    [aiBoard.ships, difficulty, mode, onStatsUpdated, playerBoard.shots, profile, shotsFired, shotsHit, startedAt]
  );

  // Auto-end blitz on timeout
  useEffect(() => {
    if (mode !== "blitz" || phase !== "playing") return;
    if (blitzRemaining <= 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      finishGame("ai", "⏱ Time up — your blitz expired.");
    }
  }, [blitzRemaining, mode, phase, finishGame]);

  const handlePlayerShot = (r: number, c: number) => {
    if (phase !== "playing" || turn !== "player" || winner) return;
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
      // Player gets another shot on hit (classic battleship: in this app, single-shot per turn).
      // Switch to AI turn to keep pacing crisp.
      scheduleAIMove();
    } else {
      setStatusMsg("Miss — handing the controls to the enemy.");
      scheduleAIMove();
    }
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
  }, [aiState, finishGame, phase, playerBoard, turn, winner]);

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
            <PlayOnlineCard />
            <div className="text-[10px] uppercase tracking-[0.4em] text-fg-dim text-center">
              · or play vs AI ·
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <ModeCard
                title="Classic"
                tag="No timer"
                desc="Hunt at your own pace — no clock, just strategy."
                gradient="from-accent/30 via-accent-3/30 to-transparent"
                onPick={(d) => startSetup("classic", d)}
              />
              <ModeCard
                title="Blitz · 3:00"
                tag="Pressure cooker"
                desc="Sink the enemy fleet in three minutes. Miss the timer, lose the war."
                gradient="from-accent-2/30 via-accent/30 to-transparent"
                onPick={(d) => startSetup("blitz", d)}
              />
            </div>
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

            <div className="grid xl:grid-cols-2 gap-6">
              <div className="flex flex-col gap-3">
                <Board
                  board={aiBoard}
                  revealShips={false}
                  onCellClick={handlePlayerShot}
                  disabled={turn !== "player" || !!winner}
                  label="Enemy Waters · Click to fire"
                />
                <ShipStatus title="Enemy Fleet" ships={aiBoard.ships} />
              </div>
              <div className="flex flex-col gap-3">
                <Board board={playerBoard} revealShips label="Your Fleet · Incoming fire" compact />
                <ShipStatus title="Your Fleet" ships={playerBoard.ships} reveal />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => {
                  if (confirm("Surrender this match?")) finishGame("ai", "🏳 You surrendered.");
                }}
                className="rounded-xl px-3 py-2 border border-white/15 text-sm hover:bg-white/5"
              >
                Surrender
              </button>
            </div>
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
    <div className="glass neon-border rounded-3xl p-6 sm:p-10 relative overflow-hidden">
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
        <div className="text-xs uppercase tracking-[0.4em] text-fg-dim">Mission Control</div>
        <h1 className="text-4xl sm:text-6xl font-extrabold leading-none mt-2 title-grad">Sink. Hunt. Conquer.</h1>
        <p className="text-fg-dim mt-3 text-base sm:text-lg max-w-xl">
          A modern Battleship arena with three AI commanders, a 3-minute blitz, and an after-action coach that scores your strategy.
        </p>
      </div>
    </div>
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
    <div className={`glass rounded-3xl p-6 relative overflow-hidden`}>
      <div className={`absolute inset-0 bg-gradient-to-br ${gradient} pointer-events-none opacity-60`} />
      <div className="relative z-10">
        <div className="text-[10px] uppercase tracking-[0.4em] text-fg-dim">{tag}</div>
        <h3 className="text-3xl font-extrabold neon-text">{title}</h3>
        <p className="text-fg-dim text-sm mt-1">{desc}</p>
        <div className="grid grid-cols-3 gap-2 mt-4">
          {(["easy", "medium", "hard"] as Difficulty[]).map((d) => (
            <motion.button
              key={d}
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => onPick(d)}
              className="rounded-xl border border-white/10 hover:border-white/30 p-3 text-left bg-black/20"
            >
              <div className="text-[10px] uppercase tracking-[0.3em] text-fg-dim">{d}</div>
              <div className="font-bold" style={{ color: DIFFICULTY_DESC[d].color }}>
                {DIFFICULTY_DESC[d].title}
              </div>
              <div className="text-[11px] text-fg-dim mt-1 leading-snug">{DIFFICULTY_DESC[d].sub}</div>
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
    <div className="glass neon-border rounded-3xl p-5 sm:p-6 relative overflow-hidden">
      <motion.div
        className="absolute -top-16 -right-16 w-48 h-48 rounded-full pointer-events-none"
        style={{
          background:
            "radial-gradient(circle, color-mix(in oklab, var(--accent-2) 35%, transparent), transparent 70%)",
        }}
        animate={{ scale: [1, 1.2, 1] }}
        transition={{ duration: 6, repeat: Infinity }}
      />
      <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-5">
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-[0.4em] text-fg-dim">
            Multiplayer · Beta
          </div>
          <h3 className="text-2xl sm:text-3xl font-extrabold neon-text">
            🌐 Play Online vs Friend
          </h3>
          <p className="text-sm text-fg-dim mt-1 max-w-md">
            Spin up a private lobby, share the invite link, and trade salvos in
            real time — with chat.
          </p>
          {error && (
            <p className="text-xs text-red-300 mt-2">{error}</p>
          )}
          {!cloud && (
            <p className="text-[11px] text-fg-dim mt-2">
              Configure <code>NEXT_PUBLIC_SUPABASE_URL</code> &amp;{" "}
              <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to enable.
            </p>
          )}
        </div>
        <motion.button
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.97 }}
          onClick={onPlayOnline}
          disabled={creating || !cloud}
          className={clsx(
            "neon-btn rounded-2xl px-5 py-3 font-bold pulse-glow whitespace-nowrap",
            (creating || !cloud) && "opacity-60 cursor-not-allowed"
          )}
        >
          {creating ? "Creating room…" : "Create Room"}
        </motion.button>
      </div>
    </div>
  );
}
