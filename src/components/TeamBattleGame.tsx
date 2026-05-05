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
import { getSupabase, supabaseEnabled } from "@/lib/supabase/client";
import {
  TeamChatRow,
  TeamRoomMemberRow,
  TeamRoomRow,
  TeamShootPayload,
  TeamShotResultPayload,
  appendShotToBoard,
  fetchTeamChat,
  fetchTeamMembers,
  fetchTeamRoomByCode,
  joinTeamRoomByCode,
  persistShotResult,
  sendTeamChat,
  setReady,
  setTeamRoomStatus,
  startTeamMatch,
  switchTeam,
  userIdAtTurn,
} from "@/lib/team-battle";
import {
  loadProfile,
  loadStats,
  recordGame,
  recordLocalLeaderboard,
  recordWeeklyGame,
  syncCloudLeaderboard,
  syncCloudWeeklyLeaderboard,
} from "@/lib/storage";
import { ApplyRewardResult, applyWinReward } from "@/lib/economy";
import { GameRecord } from "@/lib/game/types";
import { RewardSummary } from "./RewardSummary";
import { notify } from "@/lib/notify";

interface TeamBattleGameProps {
  roomCode: string;
  myPlayerId: string;
  myName: string;
}

type Stage = "lobby" | "placing" | "playing" | "finished";

export function TeamBattleGame({
  roomCode,
  myPlayerId,
  myName,
}: TeamBattleGameProps) {
  const [room, setRoom] = useState<TeamRoomRow | null>(null);
  const [members, setMembers] = useState<TeamRoomMemberRow[]>([]);
  const [chat, setChat] = useState<TeamChatRow[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>("lobby");
  const [myShips, setMyShips] = useState<Ship[]>([]);
  const [myReady, setMyReady] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string>("Connecting…");
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [pendingShot, setPendingShot] = useState<string | null>(null);
  const [reward, setReward] = useState<ApplyRewardResult | null>(null);

  // Local board states keyed by user_id (player id) — opponent boards
  // include only revealed shots; my board includes my own ships.
  const [boards, setBoards] = useState<Map<string, BoardData>>(new Map());

  const channelRef = useRef<RealtimeChannel | null>(null);
  const myShipsRef = useRef<Ship[]>([]);
  const boardsRef = useRef<Map<string, BoardData>>(new Map());
  const recordedRef = useRef(false);
  const handleShotRef = useRef<(p: TeamShootPayload) => void>(() => {});
  const handleResultRef = useRef<(p: TeamShotResultPayload) => void>(() => {});

  useEffect(() => {
    myShipsRef.current = myShips;
  }, [myShips]);
  useEffect(() => {
    boardsRef.current = boards;
  }, [boards]);

  // ── Load / join room ─────────────────────────────────────
  useEffect(() => {
    if (!supabaseEnabled()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoadError("Online play requires Supabase env vars.");
      return;
    }
    let cancelled = false;
    (async () => {
      const r = await fetchTeamRoomByCode(roomCode);
      if (cancelled) return;
      if (!r) {
        setLoadError("Room not found.");
        return;
      }
      const inRoom = r.team1_ids.includes(myPlayerId) || r.team2_ids.includes(myPlayerId);
      if (!inRoom) {
        const res = await joinTeamRoomByCode(roomCode, myPlayerId, myName);
        if (cancelled) return;
        if (!res.ok || !res.room) {
          setLoadError(res.error ?? "Could not join.");
          return;
        }
        setRoom(res.room);
      } else {
        setRoom(r);
      }

      const m = await fetchTeamMembers(r.id);
      if (cancelled) return;
      setMembers(m);
      const c = await fetchTeamChat(r.id);
      if (cancelled) return;
      setChat(c);
      setStatusMsg("Pick a team and ready up.");
    })();
    return () => {
      cancelled = true;
    };
  }, [roomCode, myPlayerId, myName]);

  const myMember = useMemo(
    () => members.find((m) => m.user_id === myPlayerId) ?? null,
    [members, myPlayerId]
  );

  const myTeam: 1 | 2 | null = myMember?.team ?? null;
  const team1Members = useMemo(
    () => members.filter((m) => m.team === 1),
    [members]
  );
  const team2Members = useMemo(
    () => members.filter((m) => m.team === 2),
    [members]
  );

  // ── Realtime subscriptions ─────────────────────────────
  useEffect(() => {
    if (!room) return;
    const sb = getSupabase();
    if (!sb) return;
    const channel = sb.channel(`team-room:${room.id}`);
    channelRef.current = channel;

    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "team_rooms", filter: `id=eq.${room.id}` },
      (payload) => {
        const next = payload.new as TeamRoomRow;
        if (!next) return;
        setRoom(next);
        if (next.status === "playing" && stage === "lobby") setStage("placing");
      }
    );
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "team_room_members", filter: `room_id=eq.${room.id}` },
      () => {
        fetchTeamMembers(room.id).then(setMembers);
      }
    );
    channel.on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "team_chat", filter: `room_id=eq.${room.id}` },
      (payload) => {
        const m = payload.new as TeamChatRow;
        setChat((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
      }
    );

    channel.on("broadcast", { event: "shoot" }, ({ payload }) => {
      handleShotRef.current(payload as TeamShootPayload);
    });
    channel.on("broadcast", { event: "result" }, ({ payload }) => {
      handleResultRef.current(payload as TeamShotResultPayload);
    });

    channel.subscribe();
    return () => {
      channel.unsubscribe();
      channelRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.id]);

  // ── Build my board view from my own ships + recorded incoming shots ───
  useEffect(() => {
    if (!myMember) return;
    const my = myMember.board_state;
    const ships = my?.ships ?? myShips;
    const shots = new Map<string, CellState>();
    if (my?.shots) for (const [k, v] of my.shots) shots.set(k, v);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBoards((prev) => {
      const next = new Map(prev);
      next.set(myPlayerId, { ships, shots });
      return next;
    });
  }, [myMember, myShips, myPlayerId]);

  // ── Pull initial enemy board states from cloud (only their shots, never their ships) ──
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBoards((prev) => {
      const next = new Map(prev);
      for (const m of members) {
        if (m.user_id === myPlayerId) continue;
        const shots = new Map<string, CellState>();
        if (m.board_state?.shots) {
          for (const [k, v] of m.board_state.shots) shots.set(k, v);
        }
        // We do NOT merge ships into our local view — opponents stay hidden.
        const existing = next.get(m.user_id);
        if (existing) {
          next.set(m.user_id, { ships: existing.ships, shots });
        } else {
          next.set(m.user_id, { ships: [], shots });
        }
      }
      return next;
    });
  }, [members, myPlayerId]);

  // ── Stage transitions driven by room status ───
  // `finalizeRef` lets us call the (later-declared) finalize function
  // without tripping the no-forward-ref lint.
  const finalizeRef = useRef<() => void>(() => {});
  useEffect(() => {
    if (!room) return;
    if (room.status === "playing" && stage !== "playing" && stage !== "finished") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStage("playing");
    } else if (room.status === "finished" && stage !== "finished") {
      setStage("finished");
      finalizeRef.current();
    }
  }, [room?.status, stage]); // eslint-disable-line react-hooks/exhaustive-deps

  // Are all 6 players present and ready?
  const allReady =
    members.length === 6 &&
    team1Members.length === 3 &&
    team2Members.length === 3 &&
    members.every((m) => m.ready);

  // Leader (first joiner of team1) starts the match once all are ready.
  const isLeader = members[0]?.user_id === myPlayerId;
  useEffect(() => {
    if (!isLeader || !room) return;
    if (room.status !== "waiting") return;
    if (!allReady) return;
    void startTeamMatch(room.id);
  }, [isLeader, allReady, room]);

  // Whose turn is it?
  const turnUserId = useMemo(
    () => (room ? userIdAtTurn(members, room.turn_index) : null),
    [members, room]
  );
  const myTurn = turnUserId === myPlayerId && room?.status === "playing";

  // ── Send a shot ──────────────────────────────────────────
  const fireAt = useCallback(
    async (targetUserId: string, r: number, c: number) => {
      if (!room || !channelRef.current) return;
      if (!myTurn) return;
      if (pendingShot) return;
      const target = members.find((m) => m.user_id === targetUserId);
      if (!target || !target.alive) return;
      if (target.team === myTeam) return;
      const k = cellKey(r, c);
      const targetBoard = boardsRef.current.get(targetUserId);
      if (targetBoard?.shots.has(k)) return;
      setPendingShot(`${targetUserId}|${k}`);
      const payload: TeamShootPayload = {
        fromUserId: myPlayerId,
        fromTeam: myTeam!,
        targetUserId,
        r,
        c,
      };
      await channelRef.current.send({ type: "broadcast", event: "shoot", payload });
    },
    [room, myTurn, pendingShot, members, myTeam, myPlayerId]
  );

  // ── Incoming shot handler ────────────────────────────────
  const handleIncomingShot = useCallback(
    async (p: TeamShootPayload) => {
      if (!room) return;
      // Only the targeted player resolves the shot — they own the ground truth
      // for their own board (we never shipped their ships out to others).
      if (p.targetUserId !== myPlayerId) return;
      const board: BoardData = {
        ships: myShipsRef.current,
        shots: new Map(boardsRef.current.get(myPlayerId)?.shots ?? new Map()),
      };
      const { board: nextBoard, result } = applyAttack(board, p.r, p.c);
      const sunkCells = result.sunkShip ? shipCells(result.sunkShip) : undefined;
      const targetSunk = allSunk(nextBoard);

      // Compute next turn index — advance until we hit a member who is alive.
      const liveMembers = members.map((m) =>
        m.user_id === myPlayerId ? { ...m, alive: !targetSunk } : m
      );
      const aliveTeam1 = liveMembers.filter((m) => m.team === 1 && m.alive).length;
      const aliveTeam2 = liveMembers.filter((m) => m.team === 2 && m.alive).length;
      const teamWiped = aliveTeam1 === 0 || aliveTeam2 === 0;
      const winnerTeam: 1 | 2 | null = teamWiped
        ? aliveTeam1 === 0
          ? 2
          : 1
        : null;

      // Advance turn — keep stepping until we land on an alive player.
      let nextTurn = (room.turn_index + 1) % Math.max(1, liveMembers.length);
      for (let i = 0; i < liveMembers.length; i++) {
        const candidate = userIdAtTurn(liveMembers, nextTurn);
        const member = liveMembers.find((m) => m.user_id === candidate);
        if (member && member.alive) break;
        nextTurn = (nextTurn + 1) % Math.max(1, liveMembers.length);
      }

      // Persist locally first.
      setBoards((prev) => {
        const next = new Map(prev);
        next.set(myPlayerId, nextBoard);
        return next;
      });
      // Update the durable copy of my board so reconnects work.
      const shotsList = Array.from(nextBoard.shots.entries());
      void appendShotToBoard(room.id, myPlayerId, shotsList, nextBoard.ships);

      const reply: TeamShotResultPayload = {
        fromUserId: p.fromUserId,
        targetUserId: p.targetUserId,
        r: p.r,
        c: p.c,
        state: result.state,
        sunkShipCells: sunkCells,
        targetSunk,
        teamWiped,
        winnerTeam: winnerTeam ?? undefined,
        nextTurnIndex: nextTurn,
      };
      const channel = channelRef.current;
      if (channel) {
        await channel.send({ type: "broadcast", event: "result", payload: reply });
      }
      await persistShotResult(room.id, reply, nextTurn, winnerTeam);
    },
    [room, myPlayerId, members]
  );

  // ── Result handler — applied by everyone (including shooter & spectators) ──
  const handleIncomingResult = useCallback(
    (p: TeamShotResultPayload) => {
      setBoards((prev) => {
        const next = new Map(prev);
        const existing = next.get(p.targetUserId) ?? { ships: [], shots: new Map() };
        const shots = new Map(existing.shots);
        if (p.state === "sunk" && p.sunkShipCells) {
          for (const [sr, sc] of p.sunkShipCells) shots.set(cellKey(sr, sc), "sunk");
        } else {
          shots.set(cellKey(p.r, p.c), p.state);
        }
        next.set(p.targetUserId, { ships: existing.ships, shots });
        return next;
      });
      setPendingShot(null);
      const target = members.find((m) => m.user_id === p.targetUserId);
      const targetName = target?.username ?? "ally";
      if (p.state === "sunk") {
        setStatusMsg(`☠ ${targetName}'s ship was sunk!`);
      } else if (p.state === "hit") {
        setStatusMsg(`💥 Hit on ${targetName}'s board.`);
      } else {
        setStatusMsg(`Miss on ${targetName}'s board.`);
      }
    },
    [members]
  );

  // Keep ref handlers in sync — the realtime subscription closes over
  // the very first reference, so we proxy through a ref to always pick
  // up the latest closure with fresh state.
  useEffect(() => {
    handleShotRef.current = handleIncomingShot;
    handleResultRef.current = handleIncomingResult;
  }, [handleIncomingShot, handleIncomingResult]);

  // ── Confirm placement ─────────────────────────────────
  const confirmPlacement = useCallback(async () => {
    if (!room) return;
    setMyReady(true);
    await setReady(room.id, myPlayerId, true, myShips);
    setStatusMsg("Locked in. Waiting for the rest of the squad…");
  }, [room, myPlayerId, myShips]);

  const handleSwitchTeam = async (team: 1 | 2) => {
    if (!room) return;
    const res = await switchTeam(room.id, myPlayerId, team);
    if (!res.ok) notify(res.error ?? "Could not switch teams.");
  };

  const sendChat = async () => {
    if (!room || !chatInput.trim()) return;
    const text = chatInput;
    setChatInput("");
    await sendTeamChat(room.id, myPlayerId, myName, myTeam, text);
  };

  // ── Stage transitions: lobby -> placing once all 6 are present and one player marks ready ──
  // Actual transition to "playing" happens when allReady triggers leader to start.
  useEffect(() => {
    if (!room) return;
    if (stage === "lobby" && members.length === 6 && team1Members.length === 3 && team2Members.length === 3) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStage("placing");
      setStatusMsg("Both teams full. Place your fleet and ready up.");
    }
  }, [stage, members.length, team1Members.length, team2Members.length, room]);

  // ── Match finalizer (reward + stats) ──────────────────
  function finalize() {
    if (recordedRef.current) return;
    if (!room || !room.winner_team) return;
    recordedRef.current = true;

    const won = room.winner_team === myTeam;
    const ownShots = members
      .filter((m) => m.team !== myTeam)
      .reduce(
        (acc, m) => {
          const b = boardsRef.current.get(m.user_id);
          if (!b) return acc;
          for (const [, v] of b.shots) {
            acc.shotsFired += 1;
            if (v === "hit" || v === "sunk") acc.shotsHit += 1;
          }
          return acc;
        },
        { shotsFired: 0, shotsHit: 0 }
      );

    const record: GameRecord = {
      id: `team_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      date: Date.now(),
      result: won ? "win" : "loss",
      difficulty: "medium",
      mode: "classic",
      shotsFired: ownShots.shotsFired,
      shotsHit: ownShots.shotsHit,
      durationMs: 0,
    };
    const profile = loadProfile();
    const { stats } = recordGame(loadStats(), record);
    recordLocalLeaderboard(profile, stats);
    syncCloudLeaderboard(profile, stats).catch(() => {});
    // Team Battle counts toward the weekly tournament — sync win/loss
    // and accuracy for both sides so the rating reflects the match.
    const weekly = recordWeeklyGame(record);
    syncCloudWeeklyLeaderboard(profile, weekly).catch(() => {});

    if (won) {
      const perfect =
        ownShots.shotsFired > 0 && ownShots.shotsHit === ownShots.shotsFired;
      const result = applyWinReward({ mode: "classic", perfect, isPvp: true });
      setReward(result);
    }
    if (room.winner_team) void setTeamRoomStatus(room.id, "finished");
  }
  useEffect(() => {
    finalizeRef.current = finalize;
  });

  // ── Render ───────────────────────────────────────────
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
        Connecting to team room…
      </div>
    );
  }

  return (
    <div className="grid lg:grid-cols-[1fr_360px] gap-6 items-start">
      <section className="min-w-0 grid gap-5">
        <Banner
          room={room}
          myTeam={myTeam}
          turnUserId={turnUserId}
          members={members}
          statusMsg={statusMsg}
        />

        {stage === "lobby" && (
          <Lobby
            roomCode={roomCode}
            team1={team1Members}
            team2={team2Members}
            myUserId={myPlayerId}
            myTeam={myTeam}
            onSwitch={handleSwitchTeam}
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
          <div className="glass rounded-3xl p-5 text-center">
            <div className="text-[10px] uppercase tracking-[0.4em] text-fg-dim">
              Standby
            </div>
            <div className="text-xl font-bold mt-1">
              ⚓ Fleet locked · waiting on{" "}
              {members.filter((m) => !m.ready).length} more captain(s)
            </div>
          </div>
        )}

        {stage === "playing" && (
          <PlayingPanel
            members={members}
            myUserId={myPlayerId}
            myTeam={myTeam!}
            boards={boards}
            myTurn={myTurn}
            turnUserId={turnUserId}
            selectedTarget={selectedTarget}
            setSelectedTarget={setSelectedTarget}
            onFire={fireAt}
            pendingShot={pendingShot}
          />
        )}

        {stage === "finished" && (
          <FinishedPanel
            room={room}
            myTeam={myTeam!}
            members={members}
            boards={boards}
            myUserId={myPlayerId}
            reward={reward}
          />
        )}
      </section>

      <aside className="lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100vh-2rem)] flex">
        <ChatBox
          chat={chat}
          chatInput={chatInput}
          setChatInput={setChatInput}
          send={sendChat}
          myTeam={myTeam}
          disabled={stage === "finished"}
        />
      </aside>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
function Banner({
  room,
  myTeam,
  turnUserId,
  members,
  statusMsg,
}: {
  room: TeamRoomRow;
  myTeam: 1 | 2 | null;
  turnUserId: string | null;
  members: TeamRoomMemberRow[];
  statusMsg: string;
}) {
  const turnMember = members.find((m) => m.user_id === turnUserId);
  return (
    <div className="glass rounded-3xl p-4 sm:p-5 flex flex-wrap items-center gap-4">
      <div className="rounded-xl px-3 py-2 border border-white/10 bg-black/20">
        <div className="text-[10px] uppercase tracking-[0.3em] text-fg-dim">Room code</div>
        <div className="font-mono font-bold text-lg tracking-[0.3em]" style={{ color: "var(--accent)" }}>
          {room.room_code}
        </div>
      </div>
      <div className="rounded-xl px-3 py-2 border border-white/10 bg-black/20">
        <div className="text-[10px] uppercase tracking-[0.3em] text-fg-dim">Status</div>
        <div className="font-bold" style={{ color: "var(--accent-3)" }}>
          {room.status === "waiting"
            ? "Filling lobby"
            : room.status === "playing"
              ? "Battle"
              : room.status === "finished"
                ? `Team ${room.winner_team} won`
                : "Placing"}
        </div>
      </div>
      <div className="rounded-xl px-3 py-2 border border-white/10 bg-black/20 min-w-[160px]">
        <div className="text-[10px] uppercase tracking-[0.3em] text-fg-dim">Turn</div>
        <div className="font-bold truncate">
          {turnMember
            ? `${turnMember.username} (Team ${turnMember.team})`
            : "—"}
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
      {myTeam && (
        <div
          className="rounded-xl px-3 py-2 border text-sm font-bold"
          style={{
            borderColor: myTeam === 1 ? "var(--accent)" : "var(--accent-2)",
            color: myTeam === 1 ? "var(--accent)" : "var(--accent-2)",
            textShadow: `0 0 8px ${myTeam === 1 ? "var(--accent)" : "var(--accent-2)"}`,
          }}
        >
          You · Team {myTeam}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
function Lobby({
  roomCode,
  team1,
  team2,
  myUserId,
  myTeam,
  onSwitch,
}: {
  roomCode: string;
  team1: TeamRoomMemberRow[];
  team2: TeamRoomMemberRow[];
  myUserId: string;
  myTeam: 1 | 2 | null;
  onSwitch: (team: 1 | 2) => void;
}) {
  const inviteText = roomCode;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(inviteText);
    } catch {
      // ignore
    }
  };

  return (
    <div className="grid gap-4">
      <div className="glass neon-border rounded-3xl p-5 grid gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.4em] text-fg-dim">
            Invite squad
          </div>
          <div className="text-xl font-bold">Share this code with five friends</div>
        </div>
        <div className="flex gap-2 items-center">
          <div
            className="flex-1 rounded-xl bg-black/40 border border-white/15 px-4 py-3 font-mono tracking-[0.4em] text-2xl text-center"
            style={{ color: "var(--accent)", textShadow: "0 0 10px var(--accent)" }}
          >
            {roomCode}
          </div>
          <button onClick={copy} className="neon-btn rounded-xl px-4 py-3 font-semibold">
            Copy code
          </button>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <TeamColumn
          team={1}
          color="var(--accent)"
          members={team1}
          myUserId={myUserId}
          isMine={myTeam === 1}
          canSwitch={myTeam !== 1 && team1.length < 3}
          onSwitch={() => onSwitch(1)}
        />
        <TeamColumn
          team={2}
          color="var(--accent-2)"
          members={team2}
          myUserId={myUserId}
          isMine={myTeam === 2}
          canSwitch={myTeam !== 2 && team2.length < 3}
          onSwitch={() => onSwitch(2)}
        />
      </div>
    </div>
  );
}

function TeamColumn({
  team,
  color,
  members,
  myUserId,
  isMine,
  canSwitch,
  onSwitch,
}: {
  team: 1 | 2;
  color: string;
  members: TeamRoomMemberRow[];
  myUserId: string;
  isMine: boolean;
  canSwitch: boolean;
  onSwitch: () => void;
}) {
  return (
    <div className="glass rounded-2xl p-4 grid gap-3 border border-white/10">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.3em] text-fg-dim">
            Squad
          </div>
          <div className="text-xl font-bold" style={{ color, textShadow: `0 0 8px ${color}` }}>
            Team {team}
          </div>
        </div>
        {canSwitch && (
          <button
            onClick={onSwitch}
            className="rounded-lg px-3 py-1.5 text-xs font-semibold border border-white/15 hover:bg-white/5"
          >
            Join
          </button>
        )}
        {isMine && (
          <span className="rounded-lg px-3 py-1.5 text-xs font-semibold border border-accent/40 text-accent">
            You
          </span>
        )}
      </div>
      <div className="grid gap-2">
        {Array.from({ length: 3 }).map((_, i) => {
          const m = members[i];
          if (!m) {
            return (
              <div
                key={`slot-${i}`}
                className="rounded-xl border border-dashed border-white/10 bg-black/20 px-3 py-2 text-xs text-fg-dim text-center"
              >
                Open slot
              </div>
            );
          }
          return (
            <div
              key={m.user_id}
              className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 flex items-center gap-3"
            >
              <span
                className="w-7 h-7 rounded-full grid place-items-center text-xs font-bold"
                style={{ background: color, color: "#06070d" }}
              >
                {m.username[0]?.toUpperCase()}
              </span>
              <div className="flex-1 min-w-0">
                <div className="font-semibold truncate">
                  {m.username}
                  {m.user_id === myUserId && (
                    <span className="ml-2 text-[10px] uppercase tracking-wider text-accent">You</span>
                  )}
                </div>
              </div>
              <span
                className={clsx(
                  "rounded-md px-2 py-0.5 text-[10px] font-bold",
                  m.ready
                    ? "border border-emerald-400/50 text-emerald-400 bg-emerald-400/10"
                    : "border border-white/15 text-fg-dim"
                )}
              >
                {m.ready ? "Ready" : "Not ready"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
function PlayingPanel({
  members,
  myUserId,
  myTeam,
  boards,
  myTurn,
  turnUserId,
  selectedTarget,
  setSelectedTarget,
  onFire,
  pendingShot,
}: {
  members: TeamRoomMemberRow[];
  myUserId: string;
  myTeam: 1 | 2;
  boards: Map<string, BoardData>;
  myTurn: boolean;
  turnUserId: string | null;
  selectedTarget: string | null;
  setSelectedTarget: (id: string | null) => void;
  onFire: (targetId: string, r: number, c: number) => void;
  pendingShot: string | null;
}) {
  const enemies = members.filter((m) => m.team !== myTeam);
  const myBoard = boards.get(myUserId) ?? { ships: [], shots: new Map() };
  const target = selectedTarget && enemies.some((e) => e.user_id === selectedTarget && e.alive)
    ? selectedTarget
    : enemies.find((e) => e.alive)?.user_id ?? null;

  const targetBoard: BoardData =
    (target ? boards.get(target) : undefined) ?? { ships: [], shots: new Map() };
  const targetMember = enemies.find((e) => e.user_id === target);

  return (
    <div className="grid gap-4">
      <div className="grid sm:grid-cols-3 gap-3">
        {enemies.map((e) => {
          const b = boards.get(e.user_id) ?? { ships: [], shots: new Map() };
          const isTarget = e.user_id === target;
          return (
            <button
              key={e.user_id}
              onClick={() => e.alive && setSelectedTarget(e.user_id)}
              disabled={!e.alive}
              className={clsx(
                "glass rounded-2xl p-2 grid gap-2 border text-left",
                isTarget ? "border-accent shadow-[0_0_18px_var(--accent)]" : "border-white/10",
                !e.alive && "opacity-40"
              )}
            >
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold truncate">{e.username}</span>
                {!e.alive && <span className="text-red-400">☠ Sunk</span>}
              </div>
              <div className="flex justify-center">
                <MiniBoard board={b} />
              </div>
            </button>
          );
        })}
      </div>

      <div className="grid xl:grid-cols-[1fr_auto] gap-6 items-start">
        <div className="flex flex-col gap-3">
          <Board
            board={targetBoard}
            revealShips={false}
            disabled={!myTurn || !target || !!pendingShot}
            onCellClick={(r, c) => {
              if (target) onFire(target, r, c);
            }}
            label={
              targetMember
                ? `Firing at · ${targetMember.username} ${myTurn ? "(your turn)" : "(wait)"}`
                : "Select an enemy board"
            }
          />
          <div className="text-xs text-fg-dim">
            {myTurn
              ? "Your move — click a tile on the highlighted enemy board."
              : turnUserId
                ? `Waiting for ${members.find((m) => m.user_id === turnUserId)?.username ?? "opponent"}…`
                : "Waiting…"}
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <Board board={myBoard} revealShips compact label="Your Fleet" />
        </div>
      </div>
    </div>
  );
}

function MiniBoard({ board }: { board: BoardData }) {
  const SIZE = 10;
  return (
    <div className="grid grid-cols-10 gap-[1px] p-1 rounded-md bg-black/30 border border-white/10">
      {Array.from({ length: SIZE }).map((_, r) =>
        Array.from({ length: SIZE }).map((_, c) => {
          const k = cellKey(r, c);
          const v = board.shots.get(k);
          let bg = "rgba(255,255,255,0.04)";
          if (v === "miss") bg = "rgba(154,165,211,0.4)";
          else if (v === "hit") bg = "rgba(255,43,214,0.7)";
          else if (v === "sunk") bg = "rgba(255,53,80,0.85)";
          return (
            <div
              key={k}
              style={{ background: bg, width: 8, height: 8, borderRadius: 1 }}
            />
          );
        })
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
function FinishedPanel({
  room,
  myTeam,
  members,
  boards,
  myUserId,
  reward,
}: {
  room: TeamRoomRow;
  myTeam: 1 | 2;
  members: TeamRoomMemberRow[];
  boards: Map<string, BoardData>;
  myUserId: string;
  reward: ApplyRewardResult | null;
}) {
  const won = room.winner_team === myTeam;
  const enemies = members.filter((m) => m.team !== myTeam);
  const allies = members.filter((m) => m.team === myTeam);
  const myBoard = boards.get(myUserId) ?? { ships: [], shots: new Map() };
  return (
    <div className="grid gap-5">
      <div className="glass rounded-3xl p-6 text-center">
        <div className="text-[10px] uppercase tracking-[0.4em] text-fg-dim">Match complete</div>
        <h2
          className="text-4xl font-extrabold"
          style={{
            color: won ? "var(--accent)" : "var(--accent-2)",
            textShadow: won
              ? "0 0 18px var(--accent)"
              : "0 0 18px var(--accent-2)",
          }}
        >
          {won ? "TEAM VICTORY" : "TEAM DEFEAT"}
        </h2>
        <p className="text-fg-dim mt-1">Team {room.winner_team} wins.</p>
        <div className="grid sm:grid-cols-2 gap-3 mt-4">
          <SquadStats title={`Your team (Team ${myTeam})`} members={allies} won={won} />
          <SquadStats title={`Enemy (Team ${myTeam === 1 ? 2 : 1})`} members={enemies} won={!won} />
        </div>
      </div>
      {reward && <RewardSummary result={reward} />}
      <div className="grid gap-3">
        <div className="text-xs uppercase tracking-[0.3em] text-fg-dim">Final boards</div>
        <div className="grid xl:grid-cols-2 gap-4">
          <div>
            <div className="text-[10px] text-fg-dim mb-1">Your fleet</div>
            <Board board={myBoard} revealShips compact />
          </div>
          {enemies.slice(0, 1).map((e) => (
            <div key={e.user_id}>
              <div className="text-[10px] text-fg-dim mb-1">Enemy: {e.username}</div>
              <Board board={boards.get(e.user_id) ?? { ships: [], shots: new Map() }} revealShips={false} compact />
            </div>
          ))}
        </div>
      </div>
      <div className="flex justify-center gap-3">
        <Link href="/" className="neon-btn rounded-xl px-4 py-3 font-semibold">
          Main menu
        </Link>
      </div>
    </div>
  );
}

function SquadStats({
  title,
  members,
  won,
}: {
  title: string;
  members: TeamRoomMemberRow[];
  won: boolean;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-3 text-left">
      <div className="text-[10px] uppercase tracking-[0.3em] text-fg-dim">{title}</div>
      <div className="grid gap-1.5 mt-1.5">
        {members.map((m) => (
          <div key={m.user_id} className="flex items-center justify-between text-sm">
            <span className="font-semibold truncate">{m.username}</span>
            <span className={clsx("text-xs", m.alive ? (won ? "text-emerald-400" : "text-fg-dim") : "text-red-400")}>
              {m.alive ? "Alive" : "Sunk"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
function ChatBox({
  chat,
  chatInput,
  setChatInput,
  send,
  myTeam,
  disabled,
}: {
  chat: TeamChatRow[];
  chatInput: string;
  setChatInput: (s: string) => void;
  send: () => void;
  myTeam: 1 | 2 | null;
  disabled: boolean;
}) {
  return (
    <section className="glass rounded-3xl p-4 flex flex-col h-[600px] w-full">
      <h3 className="text-lg font-bold neon-text">💬 Team Chat</h3>
      <div className="flex-1 mt-2 overflow-y-auto pr-1 space-y-2">
        {chat.length === 0 && (
          <div className="text-sm text-fg-dim text-center mt-6">
            Coordinate with your squad here.
          </div>
        )}
        {chat.map((m) => {
          const allyColor =
            m.team === 1
              ? "var(--accent)"
              : m.team === 2
                ? "var(--accent-2)"
                : "var(--fg-dim)";
          return (
            <div key={m.id} className="rounded-lg bg-black/20 border border-white/5 px-3 py-2">
              <div className="flex items-center gap-2 text-[11px]">
                <span className="font-bold" style={{ color: allyColor }}>
                  {m.username}
                </span>
                {m.team && (
                  <span className="text-fg-dim">· Team {m.team}</span>
                )}
                <span className="text-fg-dim">·</span>
                <span className="text-fg-dim">
                  {new Date(m.created_at).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <div className="text-sm mt-1 break-words">{m.text}</div>
            </div>
          );
        })}
      </div>
      <div className="flex gap-2 mt-2">
        <input
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") send();
          }}
          maxLength={200}
          disabled={disabled}
          placeholder={myTeam ? "Message squad…" : "Join a team to chat"}
          className="flex-1 rounded-lg bg-black/40 border border-white/15 px-3 py-2 text-sm disabled:opacity-50"
        />
        <button
          onClick={send}
          disabled={disabled || !chatInput.trim() || !myTeam}
          className="neon-btn rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </section>
  );
}
