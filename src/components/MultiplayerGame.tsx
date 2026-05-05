"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import clsx from "clsx";
import type { RealtimeChannel } from "@supabase/supabase-js";

import {
  Board as BoardData,
  CellState,
  Ship,
  cellKey,
  shipCells,
} from "@/lib/game/types";
import { allSunk, applyAttack } from "@/lib/game/board";
import { Board } from "./Board";
import { ShipPlacement } from "./ShipPlacement";
import { ChatPanel, type ChatMessage, type FloatingReaction } from "./ChatPanel";
import { getSupabase, supabaseEnabled } from "@/lib/supabase/client";
import {
  type MessageRow,
  type RoomRow,
  type ShootPayload,
  type ShotResultPayload,
  clearMessages,
  fetchMessages,
  fetchRoom,
  joinRoom,
  sendMessage,
  setRoomStatus,
} from "@/lib/game/multiplayer";
import {
  loadProfile,
  loadStats,
  recordGame,
  recordLocalLeaderboard,
  recordWeeklyGame,
  syncCloudLeaderboard,
  syncCloudWeeklyLeaderboard,
} from "@/lib/storage";
import {
  ApplyRewardResult,
  applyWinReward,
  pvpRewardEligible,
  recordPvpPayout,
} from "@/lib/economy";
import { bumpClanWin, rivalClanBoost } from "@/lib/clans";
import { ClanTag } from "./ClanTag";
import { GameRecord } from "@/lib/game/types";
import { RewardSummary } from "./RewardSummary";

type Side = "p1" | "p2";
type Stage = "placing" | "playing" | "over";

interface MultiplayerGameProps {
  roomId: string;
  myPlayerId: string;
  myName: string;
}

const SINK_EMOJIS = ["☠️", "💀", "⚓", "🔥"];
const HIT_EMOJIS = ["💥", "🎯", "⚡"];
const DISCONNECT_GRACE_MS = 5000;

export function MultiplayerGame({
  roomId,
  myPlayerId,
  myName,
}: MultiplayerGameProps) {
  const [room, setRoom] = useState<RoomRow | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [stage, setStage] = useState<Stage>("placing");
  const [myShips, setMyShips] = useState<Ship[]>([]);
  const [myBoardShots, setMyBoardShots] = useState<Map<string, CellState>>(
    new Map()
  );
  const [enemyShots, setEnemyShots] = useState<Map<string, CellState>>(
    new Map()
  );
  const [myReady, setMyReady] = useState(false);
  const [opponentReady, setOpponentReady] = useState(false);
  const [turn, setTurn] = useState<Side | null>(null);
  const [winner, setWinner] = useState<Side | null>(null);
  const [winReason, setWinReason] = useState<string>("");
  const [statusMsg, setStatusMsg] = useState<string>("Connecting…");
  const [pendingShot, setPendingShot] = useState<string | null>(null);

  const [opponentOnline, setOpponentOnline] = useState(false);
  const opponentEverOnlineRef = useRef(false);

  const [rewardResult, setRewardResult] = useState<ApplyRewardResult | null>(null);
  const [rewardSkippedReason, setRewardSkippedReason] = useState<string | null>(null);
  const matchStartedAtRef = useRef<number>(0);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [reactions, setReactions] = useState<FloatingReaction[]>([]);
  const [linkCopied, setLinkCopied] = useState(false);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const myShipsRef = useRef<Ship[]>([]);
  const myBoardShotsRef = useRef<Map<string, CellState>>(new Map());
  const winnerRef = useRef<Side | null>(null);
  const gameRecorded = useRef(false);

  useEffect(() => {
    myShipsRef.current = myShips;
  }, [myShips]);
  useEffect(() => {
    myBoardShotsRef.current = myBoardShots;
  }, [myBoardShots]);
  useEffect(() => {
    winnerRef.current = winner;
  }, [winner]);

  const mySide: Side | null = useMemo(() => {
    if (!room) return null;
    if (room.player1_id === myPlayerId) return "p1";
    if (room.player2_id === myPlayerId) return "p2";
    return null;
  }, [room, myPlayerId]);

  const opponentSide: Side | null = mySide
    ? mySide === "p1"
      ? "p2"
      : "p1"
    : null;
  const opponentId = mySide && room
    ? mySide === "p1"
      ? room.player2_id
      : room.player1_id
    : null;
  const opponentName =
    (mySide && room
      ? mySide === "p1"
        ? room.player2_name
        : room.player1_name
      : null) || "Opponent";

  const inviteUrl =
    typeof window !== "undefined" && room
      ? `${window.location.origin}/room/${room.id}`
      : "";

  // ── Reactions ────────────────────────────────────────────────
  const spawnReaction = useCallback(
    (emoji: string, side: "mine" | "theirs") => {
      const id = `r_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      setReactions((prev) => [...prev, { id, emoji, side }]);
      setTimeout(
        () => setReactions((prev) => prev.filter((r) => r.id !== id)),
        1700
      );
    },
    []
  );

  const recordPvpOutcome = useCallback(
    async (won: boolean) => {
      if (gameRecorded.current) return;
      gameRecorded.current = true;
      const myShotsFired = enemyShots.size;
      const myShotsHit = Array.from(enemyShots.values()).filter(
        (s) => s === "hit" || s === "sunk"
      ).length;
      const perfect = myShotsFired > 0 && myShotsHit === myShotsFired;
      const startedAt = matchStartedAtRef.current || Date.now();
      const record: GameRecord = {
        id: `mp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        date: Date.now(),
        result: won ? "win" : "loss",
        difficulty: "medium",
        mode: "classic",
        shotsFired: myShotsFired,
        shotsHit: myShotsHit,
        durationMs: Date.now() - startedAt,
      };
      const profile = loadProfile();
      const { stats } = recordGame(loadStats(), record);
      recordLocalLeaderboard(profile, stats);
      syncCloudLeaderboard(profile, stats).catch(() => {});
      const weekly = recordWeeklyGame(record);
      syncCloudWeeklyLeaderboard(profile, weekly).catch(() => {});

      if (!won) return;

      const opp = (opponentName || "").trim();
      const eligible = opp ? await pvpRewardEligible(opp) : true;
      if (!eligible) {
        setRewardSkippedReason(
          `Already paid out vs ${opp} today — only one PvP reward per opponent per day.`
        );
        return;
      }

      const rivalClan = opp ? await rivalClanBoost(opp) : false;
      const result = applyWinReward({
        mode: "classic",
        perfect,
        isPvp: true,
        rivalClan,
      });
      if (opp) void recordPvpPayout(opp);
      void bumpClanWin();
      setRewardResult(result);
    },
    [enemyShots, opponentName]
  );

  // ── Winner ───────────────────────────────────────────────────
  const declareWinner = useCallback(
    (side: Side, msg: string) => {
      if (winnerRef.current) return;
      winnerRef.current = side;
      setWinner(side);
      setWinReason(msg);
      setStage("over");
      setStatusMsg(msg);
      const won = mySide === side;
      // Best-effort cleanup. Both clients can call these; second call is a no-op.
      if (won) {
        setRoomStatus(roomId, "finished");
        clearMessages(roomId);
        setMessages([]);
      }
      // Both sides record the outcome — losses count toward the weekly
      // tournament too (rating: −10 per loss, +25 per win, +10 perfect).
      void recordPvpOutcome(won);
    },
    [mySide, roomId, recordPvpOutcome]
  );

  // ── Room load / join ────────────────────────────────────────
  useEffect(() => {
    if (!supabaseEnabled()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoadError(
        "Online play requires Supabase. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."
      );
      return;
    }
    let cancelled = false;
    (async () => {
      const existing = await fetchRoom(roomId);
      if (cancelled) return;
      if (!existing) {
        setLoadError("Room not found.");
        return;
      }
      const isInRoom =
        existing.player1_id === myPlayerId ||
        existing.player2_id === myPlayerId;
      if (isInRoom) {
        setRoom(existing);
        setStatusMsg(
          existing.player2_id
            ? "Place your fleet."
            : "Waiting for opponent to join…"
        );
        return;
      }
      if (existing.player2_id) {
        setLoadError("This room is full.");
        return;
      }
      const joined = await joinRoom(roomId, myPlayerId, myName);
      if (cancelled) return;
      if (!joined) {
        setLoadError("Could not join room.");
        return;
      }
      setRoom(joined);
      setStatusMsg("Place your fleet.");
    })();
    return () => {
      cancelled = true;
    };
  }, [roomId, myPlayerId, myName]);

  // ── Realtime subscription ──────────────────────────────────
  useEffect(() => {
    if (!room || !mySide) return;
    const sb = getSupabase();
    if (!sb) return;

    const channel = sb.channel(`room:${room.id}`, {
      config: { presence: { key: myPlayerId } },
    });
    channelRef.current = channel;

    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState();
      const others = Object.keys(state).filter((k) => k !== myPlayerId);
      const present = others.length > 0;
      setOpponentOnline(present);
      if (present) opponentEverOnlineRef.current = true;
    });

    channel.on("broadcast", { event: "ready" }, ({ payload }) => {
      const p = payload as { fromId: string };
      if (p.fromId === myPlayerId) return;
      setOpponentReady(true);
    });

    channel.on("broadcast", { event: "shoot" }, async ({ payload }) => {
      const p = payload as ShootPayload;
      if (p.fromId === myPlayerId) return;
      if (winnerRef.current) return;
      const myCurrentBoard: BoardData = {
        ships: myShipsRef.current,
        shots: myBoardShotsRef.current,
      };
      const { board: nextBoard, result } = applyAttack(
        myCurrentBoard,
        p.r,
        p.c
      );
      setMyBoardShots(new Map(nextBoard.shots));
      setMyShips(nextBoard.ships);

      const allMyShipsSunk = allSunk(nextBoard);
      const sunkCells = result.sunkShip
        ? shipCells(result.sunkShip)
        : undefined;

      const reply: ShotResultPayload = {
        fromId: myPlayerId,
        r: p.r,
        c: p.c,
        state: result.state,
        sunkShipType: result.sunkShip?.type,
        sunkShipCells: sunkCells,
        allSunk: allMyShipsSunk,
      };

      await channel.send({
        type: "broadcast",
        event: "result",
        payload: reply,
      });

      if (allMyShipsSunk) {
        declareWinner(opponentSide!, "💀 Your fleet was annihilated.");
        return;
      }

      // Single shot per turn — control returns to me.
      setTurn(mySide);
      if (result.state === "sunk") {
        setStatusMsg(`☠ Enemy sank your ${result.sunkShip?.type}.`);
        spawnReaction(SINK_EMOJIS[Math.floor(Math.random() * SINK_EMOJIS.length)], "theirs");
      } else if (result.state === "hit") {
        setStatusMsg(`💥 Enemy hit at ${labelOf(p.r, p.c)}.`);
        spawnReaction(HIT_EMOJIS[Math.floor(Math.random() * HIT_EMOJIS.length)], "theirs");
      } else {
        setStatusMsg(`Enemy missed at ${labelOf(p.r, p.c)}. Your turn.`);
      }
    });

    channel.on("broadcast", { event: "result" }, ({ payload }) => {
      const p = payload as ShotResultPayload;
      if (p.fromId === myPlayerId) return;
      if (winnerRef.current) return;
      setEnemyShots((prev) => {
        const next = new Map(prev);
        if (p.state === "sunk" && p.sunkShipCells) {
          for (const [sr, sc] of p.sunkShipCells) {
            next.set(cellKey(sr, sc), "sunk");
          }
        } else {
          next.set(cellKey(p.r, p.c), p.state);
        }
        return next;
      });
      setPendingShot(null);
      if (p.allSunk) {
        declareWinner(mySide, "🏆 Enemy fleet annihilated!");
        return;
      }
      setTurn(opponentSide!);
      if (p.state === "sunk") {
        setStatusMsg(`☠ You sank their ${p.sunkShipType}!`);
        spawnReaction(SINK_EMOJIS[Math.floor(Math.random() * SINK_EMOJIS.length)], "mine");
      } else if (p.state === "hit") {
        setStatusMsg("🎯 Direct hit! Opponent's turn.");
        spawnReaction(HIT_EMOJIS[Math.floor(Math.random() * HIT_EMOJIS.length)], "mine");
      } else {
        setStatusMsg("Miss. Opponent's turn.");
      }
    });

    channel.on("broadcast", { event: "surrender" }, ({ payload }) => {
      const p = payload as { fromId: string };
      if (p.fromId === myPlayerId) return;
      declareWinner(mySide, "🏳 Opponent surrendered.");
    });

    channel.on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `room_id=eq.${room.id}`,
      },
      (payload) => {
        const m = payload.new as MessageRow;
        setMessages((prev) => {
          if (prev.some((x) => x.id === m.id)) return prev;
          return [
            ...prev,
            {
              id: m.id,
              playerId: m.player_id,
              playerName: m.player_name || "Player",
              text: m.text,
              createdAt: new Date(m.created_at).getTime(),
            },
          ];
        });
      }
    );

    channel.on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "rooms",
        filter: `id=eq.${room.id}`,
      },
      (payload) => {
        const next = payload.new as RoomRow;
        setRoom(next);
      }
    );

    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await channel.track({ playerId: myPlayerId, name: myName });
      }
    });

    fetchMessages(room.id).then((rows) => {
      setMessages(
        rows.map((r) => ({
          id: r.id,
          playerId: r.player_id,
          playerName: r.player_name || "Player",
          text: r.text,
          createdAt: new Date(r.created_at).getTime(),
        }))
      );
    });

    return () => {
      channel.unsubscribe();
      channelRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.id, mySide, myPlayerId, myName]);

  // ── Both ready → start ────────────────────────────────────
  useEffect(() => {
    if (stage !== "placing") return;
    if (!myReady || !opponentReady) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    setStage("playing");
    setTurn("p1");
    setStatusMsg(
      mySide === "p1"
        ? "You go first. Take your shot."
        : "Opponent goes first. Stand by…"
    );
    matchStartedAtRef.current = Date.now();
    /* eslint-enable react-hooks/set-state-in-effect */
    if (mySide === "p1") void setRoomStatus(roomId, "playing");
  }, [myReady, opponentReady, stage, mySide, roomId]);

  // ── Disconnect detection ──────────────────────────────────
  useEffect(() => {
    if (!opponentEverOnlineRef.current) return;
    if (opponentOnline) return;
    if (winner) return;
    if (stage !== "playing") return;
    const t = window.setTimeout(() => {
      declareWinner(mySide!, "🚪 Opponent disconnected. You win!");
    }, DISCONNECT_GRACE_MS);
    return () => clearTimeout(t);
  }, [opponentOnline, winner, stage, mySide, declareWinner]);

  // ── Actions ───────────────────────────────────────────────
  const confirmPlacement = useCallback(async () => {
    if (myReady) return;
    setMyReady(true);
    setStatusMsg(opponentReady ? "Both fleets ready." : "Fleet locked. Waiting on opponent…");
    const ch = channelRef.current;
    if (ch) {
      await ch.send({
        type: "broadcast",
        event: "ready",
        payload: { fromId: myPlayerId },
      });
    }
  }, [myReady, opponentReady, myPlayerId]);

  const fireShot = useCallback(
    async (r: number, c: number) => {
      if (stage !== "playing") return;
      if (turn !== mySide) return;
      if (winner) return;
      if (pendingShot) return;
      const k = cellKey(r, c);
      if (enemyShots.has(k)) return;
      setPendingShot(k);
      setStatusMsg(`Shot away at ${labelOf(r, c)}…`);
      const ch = channelRef.current;
      if (ch) {
        const payload: ShootPayload = { fromId: myPlayerId, r, c };
        await ch.send({ type: "broadcast", event: "shoot", payload });
      }
    },
    [stage, turn, mySide, winner, pendingShot, enemyShots, myPlayerId]
  );

  const surrender = useCallback(async () => {
    if (winner) return;
    if (!confirm("Surrender this match?")) return;
    const ch = channelRef.current;
    if (ch) {
      await ch.send({
        type: "broadcast",
        event: "surrender",
        payload: { fromId: myPlayerId },
      });
    }
    if (opponentSide) declareWinner(opponentSide, "🏳 You surrendered.");
  }, [winner, opponentSide, myPlayerId, declareWinner]);

  const handleSendChat = useCallback(
    async (text: string) => {
      if (!room) return;
      await sendMessage(room.id, myPlayerId, myName, text);
    },
    [room, myPlayerId, myName]
  );

  const copyInvite = useCallback(async () => {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 1600);
    } catch {
      // Clipboard may be unavailable (insecure context) — fall back silently.
    }
  }, [inviteUrl]);

  // ── Render ────────────────────────────────────────────────
  if (loadError) {
    return (
      <div className="glass rounded-3xl p-8 text-center max-w-xl mx-auto">
        <h2 className="text-2xl font-bold mb-3">{loadError}</h2>
        <Link href="/" className="neon-btn rounded-xl px-4 py-2 inline-block">
          Back to home
        </Link>
      </div>
    );
  }
  if (!room) {
    return (
      <div className="glass rounded-3xl p-8 text-center text-fg-dim">
        Connecting to room…
      </div>
    );
  }
  if (!mySide) {
    return (
      <div className="glass rounded-3xl p-8 text-center max-w-xl mx-auto">
        <h2 className="text-xl font-bold mb-2">This room is full.</h2>
        <p className="text-sm text-fg-dim mb-4">
          Spectating isn&apos;t supported yet — start your own match.
        </p>
        <Link href="/" className="neon-btn rounded-xl px-4 py-2 inline-block">
          Back to home
        </Link>
      </div>
    );
  }

  const waitingForOpponent = !opponentId;
  const myBoardData: BoardData = { ships: myShips, shots: myBoardShots };
  const enemyBoardData: BoardData = { ships: [], shots: enemyShots };

  return (
    <div className="grid lg:grid-cols-[1fr_360px] gap-6 items-start">
      <section className="min-w-0 grid gap-5">
        <Banner
          mySide={mySide}
          opponentName={opponentName}
          opponentOnline={opponentOnline}
          opponentJoined={!!opponentId}
          turn={turn}
          stage={stage}
          statusMsg={statusMsg}
        />

        {waitingForOpponent && stage === "placing" && (
          <InviteCard
            inviteUrl={inviteUrl}
            copied={linkCopied}
            onCopy={copyInvite}
          />
        )}

        {stage === "placing" && !myReady && (
          <ShipPlacement
            ships={myShips}
            onChange={setMyShips}
            onConfirm={confirmPlacement}
          />
        )}

        {stage === "placing" && myReady && (
          <div className="glass rounded-3xl p-6 grid gap-4">
            <div className="text-center">
              <div className="text-[10px] uppercase tracking-[0.4em] text-fg-dim">
                Standby
              </div>
              <div className="text-xl font-bold">
                ⚓ Fleet locked ·{" "}
                {opponentReady ? "Preparing arena…" : "Waiting on opponent"}
              </div>
            </div>
            <div className="flex justify-center">
              <Board
                board={myBoardData}
                revealShips
                compact
                label="Your Fleet"
              />
            </div>
          </div>
        )}

        {stage === "playing" && (
          <div className="grid xl:grid-cols-2 gap-6">
            <div className="flex flex-col gap-3">
              <Board
                board={enemyBoardData}
                revealShips={false}
                disabled={turn !== mySide || !!pendingShot || !!winner}
                onCellClick={fireShot}
                label={`Enemy Waters · ${turn === mySide ? "Click to fire" : "Wait"}`}
              />
            </div>
            <div className="flex flex-col gap-3">
              <Board
                board={myBoardData}
                revealShips
                compact
                label="Your Fleet · Incoming fire"
              />
            </div>
          </div>
        )}

        {stage === "over" && (
          <div className="glass rounded-3xl p-6 grid gap-4 text-center">
            <div>
              <div className="text-[10px] uppercase tracking-[0.4em] text-fg-dim">
                Match complete
              </div>
              <h2
                className="text-4xl font-extrabold"
                style={{
                  color:
                    winner === mySide ? "var(--accent)" : "var(--accent-2)",
                  textShadow:
                    winner === mySide
                      ? "0 0 18px var(--accent)"
                      : "0 0 18px var(--accent-2)",
                }}
              >
                {winner === mySide ? "VICTORY" : "DEFEAT"}
              </h2>
              <p className="text-fg-dim mt-1">{winReason}</p>
            </div>
            {rewardResult && (
              <div className="text-left">
                <RewardSummary result={rewardResult} />
              </div>
            )}
            {rewardSkippedReason && (
              <div className="rounded-xl px-3 py-2 text-xs text-fg-dim border border-white/10 bg-black/30">
                {rewardSkippedReason}
              </div>
            )}
            <div className="grid xl:grid-cols-2 gap-6">
              <Board
                board={enemyBoardData}
                revealShips={false}
                label="Enemy Waters"
              />
              <Board
                board={myBoardData}
                revealShips
                compact
                label="Your Fleet"
              />
            </div>
            <div className="flex justify-center gap-3 mt-2">
              <Link
                href="/"
                className="neon-btn rounded-xl px-4 py-3 font-semibold"
              >
                Main menu
              </Link>
            </div>
          </div>
        )}

        {stage === "playing" && (
          <div className="flex justify-end">
            <button
              onClick={surrender}
              className="rounded-xl px-3 py-2 border border-white/15 text-sm hover:bg-white/5"
            >
              Surrender
            </button>
          </div>
        )}
      </section>

      <aside className="lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100vh-2rem)] flex">
        <div className="w-full">
          <ChatPanel
            messages={messages}
            myPlayerId={myPlayerId}
            myName={myName}
            opponentName={opponentName}
            reactions={reactions}
            disabled={stage === "over" || waitingForOpponent}
            placeholder={
              waitingForOpponent
                ? "Chat opens when opponent joins"
                : stage === "over"
                  ? "Chat closed — match complete"
                  : "Message…"
            }
            onSend={handleSendChat}
          />
        </div>
      </aside>
    </div>
  );
}

function Banner({
  mySide,
  opponentName,
  opponentOnline,
  opponentJoined,
  turn,
  stage,
  statusMsg,
}: {
  mySide: Side;
  opponentName: string;
  opponentOnline: boolean;
  opponentJoined: boolean;
  turn: Side | null;
  stage: Stage;
  statusMsg: string;
}) {
  const turnLabel =
    stage === "placing"
      ? "Placing"
      : stage === "over"
        ? "Over"
        : turn === mySide
          ? "Yours"
          : "Theirs";
  const turnColor =
    stage !== "playing"
      ? "var(--fg-dim)"
      : turn === mySide
        ? "var(--accent)"
        : "var(--accent-2)";
  return (
    <div className="glass rounded-3xl p-4 sm:p-5 flex flex-wrap items-center gap-4">
      <div className="rounded-xl px-3 py-2 border border-white/10 bg-black/20 min-w-[120px]">
        <div className="text-[10px] uppercase tracking-[0.3em] text-fg-dim">
          Match
        </div>
        <div
          className="font-bold tabular-nums leading-tight"
          style={{ color: "var(--accent)" }}
        >
          1v1 Online
        </div>
      </div>
      <div className="rounded-xl px-3 py-2 border border-white/10 bg-black/20 min-w-[150px]">
        <div className="text-[10px] uppercase tracking-[0.3em] text-fg-dim">
          Opponent
        </div>
        <div className="flex items-center gap-2">
          <span
            className={clsx(
              "w-2 h-2 rounded-full",
              !opponentJoined
                ? "bg-amber-400 shadow-[0_0_8px_rgb(251,191,36)]"
                : opponentOnline
                  ? "bg-emerald-400 shadow-[0_0_8px_rgb(52,211,153)]"
                  : "bg-red-400 shadow-[0_0_8px_rgb(248,113,113)]"
            )}
          />
          <span className="font-bold truncate max-w-[160px] inline-flex items-center gap-1.5">
            {opponentJoined ? opponentName : "Waiting…"}
            {opponentJoined && <ClanTag username={opponentName} fetch />}
          </span>
        </div>
      </div>
      <div className="rounded-xl px-3 py-2 border border-white/10 bg-black/20">
        <div className="text-[10px] uppercase tracking-[0.3em] text-fg-dim">
          Turn
        </div>
        <div className="font-bold" style={{ color: turnColor }}>
          {turnLabel}
        </div>
      </div>
      <div className="flex-1 min-w-[180px] text-sm text-fg-dim text-right">
        <AnimatePresence mode="wait">
          <motion.span
            key={statusMsg}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
          >
            {statusMsg}
          </motion.span>
        </AnimatePresence>
      </div>
    </div>
  );
}

function InviteCard({
  inviteUrl,
  copied,
  onCopy,
}: {
  inviteUrl: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="glass neon-border rounded-3xl p-5 grid gap-3">
      <div>
        <div className="text-[10px] uppercase tracking-[0.4em] text-fg-dim">
          Lobby
        </div>
        <div className="text-xl font-bold">Invite a friend</div>
        <div className="text-xs text-fg-dim mt-1">
          Send this link. The match starts when they join.
        </div>
      </div>
      <div className="flex gap-2">
        <input
          readOnly
          value={inviteUrl}
          onClick={(e) => (e.target as HTMLInputElement).select()}
          className="flex-1 rounded-lg bg-black/30 border border-white/15 px-3 py-2 text-sm font-mono"
        />
        <button
          onClick={onCopy}
          className="neon-btn rounded-lg px-4 py-2 text-sm font-semibold whitespace-nowrap"
        >
          {copied ? "Copied!" : "Copy link"}
        </button>
      </div>
    </div>
  );
}

function labelOf(r: number, c: number) {
  return `${"ABCDEFGHIJ"[c]}${r + 1}`;
}
