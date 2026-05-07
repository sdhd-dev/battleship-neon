"use client";

import { getSupabase, supabaseEnabled } from "./supabase/client";
import { CellState, Ship } from "./game/types";

export type TeamRoomStatus = "waiting" | "placing" | "playing" | "finished";

export interface TeamRoomRow {
  id: string;
  room_code: string;
  team1_ids: string[];
  team2_ids: string[];
  status: TeamRoomStatus;
  turn_index: number;
  winner_team: number | null;
  created_at: string;
}

export interface TeamRoomMemberRow {
  room_id: string;
  user_id: string;
  username: string;
  team: 1 | 2;
  ready: boolean;
  board_state: { ships: Ship[]; shots: Array<[string, CellState]> } | null;
  alive: boolean;
  joined_at: string;
}

export interface TeamChatRow {
  id: string;
  room_id: string;
  user_id: string;
  username: string;
  team: number | null;
  text: string;
  created_at: string;
}

export interface TeamShootPayload {
  fromUserId: string;
  fromTeam: 1 | 2;
  targetUserId: string;
  r: number;
  c: number;
  // Set when the shot is a custom-ship retaliation bonus — target applies
  // the attack but the turn index does not advance.
  bonus?: boolean;
}

export interface TeamShotResultPayload {
  fromUserId: string;
  targetUserId: string;
  r: number;
  c: number;
  state: CellState;
  sunkShipCells?: Array<[number, number]>;
  // Surface custom-ship metadata only on a sunk hit — keeps opponent boards
  // dark until the ship actually goes down.
  sunkShipCustomName?: string;
  sunkShipCustomSkin?: string;
  sunkShipCustomBadge?: string;
  targetSunk: boolean;            // all ships of this player sunk
  teamWiped: boolean;             // entire team wiped
  winnerTeam?: 1 | 2;
  nextTurnIndex: number;
  // Echoed from the originating ShootPayload so the shooter knows whether
  // to clear pendingShot and continue draining their bonus queue.
  bonus?: boolean;
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateRoomCode(len = 6): string {
  let out = "";
  for (let i = 0; i < len; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

export async function createTeamRoom(
  leaderId: string,
  leaderName: string
): Promise<TeamRoomRow | null> {
  const sb = getSupabase();
  if (!sb) return null;

  // Try a few codes in case of collision (very unlikely with the alphabet/length).
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateRoomCode();
    const { data, error } = await sb
      .from("team_rooms")
      .insert({ room_code: code, team1_ids: [leaderId], team2_ids: [] })
      .select()
      .single();
    if (error) {
      if (/duplicate|unique/i.test(error.message)) continue;
      return null;
    }
    if (!data) continue;
    const room = data as TeamRoomRow;
    await sb.from("team_room_members").insert({
      room_id: room.id,
      user_id: leaderId,
      username: leaderName,
      team: 1,
      ready: false,
    });
    return room;
  }
  return null;
}

export async function fetchTeamRoomByCode(code: string): Promise<TeamRoomRow | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const upper = code.trim().toUpperCase();
  if (!upper) return null;
  const { data } = await sb
    .from("team_rooms")
    .select("*")
    .eq("room_code", upper)
    .maybeSingle();
  return (data as TeamRoomRow | null) ?? null;
}

export async function fetchTeamRoomById(id: string): Promise<TeamRoomRow | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.from("team_rooms").select("*").eq("id", id).maybeSingle();
  return (data as TeamRoomRow | null) ?? null;
}

export async function fetchTeamMembers(roomId: string): Promise<TeamRoomMemberRow[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data } = await sb
    .from("team_room_members")
    .select("*")
    .eq("room_id", roomId)
    .order("joined_at", { ascending: true });
  return (data as TeamRoomMemberRow[] | null) ?? [];
}

export async function joinTeamRoomByCode(
  code: string,
  userId: string,
  username: string
): Promise<{ ok: boolean; error?: string; room?: TeamRoomRow }> {
  if (!supabaseEnabled()) return { ok: false, error: "Cloud sync is off." };
  const sb = getSupabase();
  if (!sb) return { ok: false, error: "Cloud client unavailable." };
  const room = await fetchTeamRoomByCode(code);
  if (!room) return { ok: false, error: "Room not found." };
  if (room.status === "finished") return { ok: false, error: "This match has ended." };

  const inTeam1 = room.team1_ids.includes(userId);
  const inTeam2 = room.team2_ids.includes(userId);
  if (inTeam1 || inTeam2) return { ok: true, room };

  // Auto-balance: if team1 has fewer players, drop them in team1.
  let team: 1 | 2 = room.team1_ids.length <= room.team2_ids.length ? 1 : 2;
  if (room.team1_ids.length >= 3 && room.team2_ids.length >= 3) {
    return { ok: false, error: "Both teams full." };
  }
  if (team === 1 && room.team1_ids.length >= 3) team = 2;
  if (team === 2 && room.team2_ids.length >= 3) team = 1;

  const next =
    team === 1
      ? { team1_ids: [...room.team1_ids, userId] }
      : { team2_ids: [...room.team2_ids, userId] };

  const { data: updated, error } = await sb
    .from("team_rooms")
    .update(next)
    .eq("id", room.id)
    .select()
    .single();
  if (error || !updated) return { ok: false, error: error?.message ?? "Could not join." };

  await sb.from("team_room_members").upsert({
    room_id: room.id,
    user_id: userId,
    username,
    team,
    ready: false,
  });

  return { ok: true, room: updated as TeamRoomRow };
}

export async function leaveTeamRoom(
  roomId: string,
  userId: string
): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const room = await fetchTeamRoomById(roomId);
  // Only prune lobby leavers — once placement starts the seat is load-bearing
  // for turn rotation and finalize logic, so abandoning users stay visible
  // (the existing disconnect handling in the match flow takes over).
  if (!room || room.status !== "waiting") return;
  await sb
    .from("team_room_members")
    .delete()
    .eq("room_id", roomId)
    .eq("user_id", userId);
  const next = {
    team1_ids: room.team1_ids.filter((id) => id !== userId),
    team2_ids: room.team2_ids.filter((id) => id !== userId),
  };
  await sb.from("team_rooms").update(next).eq("id", roomId);
}

export async function switchTeam(
  roomId: string,
  userId: string,
  toTeam: 1 | 2
): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabase();
  if (!sb) return { ok: false, error: "Cloud client unavailable." };
  const room = await fetchTeamRoomById(roomId);
  if (!room) return { ok: false, error: "Room missing." };
  if (room.status !== "waiting") return { ok: false, error: "Match already started." };
  const targetIds = toTeam === 1 ? room.team1_ids : room.team2_ids;
  if (targetIds.includes(userId)) return { ok: true };
  if (targetIds.length >= 3) return { ok: false, error: "Team full." };

  const next = {
    team1_ids: room.team1_ids.filter((id) => id !== userId),
    team2_ids: room.team2_ids.filter((id) => id !== userId),
  };
  if (toTeam === 1) next.team1_ids.push(userId);
  else next.team2_ids.push(userId);

  await sb.from("team_rooms").update(next).eq("id", roomId);
  await sb.from("team_room_members").update({ team: toTeam }).eq("room_id", roomId).eq("user_id", userId);
  return { ok: true };
}

export async function setReady(
  roomId: string,
  userId: string,
  ready: boolean,
  ships: Ship[]
): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const board_state = { ships, shots: [] as Array<[string, CellState]> };
  await sb
    .from("team_room_members")
    .update({ ready, board_state })
    .eq("room_id", roomId)
    .eq("user_id", userId);
}

export async function startTeamMatch(roomId: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  await sb
    .from("team_rooms")
    .update({ status: "playing", turn_index: 0 })
    .eq("id", roomId);
}

export async function setTeamRoomStatus(
  roomId: string,
  status: TeamRoomStatus
): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  await sb.from("team_rooms").update({ status }).eq("id", roomId);
}

export async function persistShotResult(
  roomId: string,
  payload: TeamShotResultPayload,
  newTurnIndex: number,
  winnerTeam: 1 | 2 | null
): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  if (winnerTeam) {
    await sb
      .from("team_rooms")
      .update({
        turn_index: newTurnIndex,
        status: "finished",
        winner_team: winnerTeam,
      })
      .eq("id", roomId);
  } else {
    await sb.from("team_rooms").update({ turn_index: newTurnIndex }).eq("id", roomId);
  }
  if (payload.targetSunk) {
    await sb
      .from("team_room_members")
      .update({ alive: false })
      .eq("room_id", roomId)
      .eq("user_id", payload.targetUserId);
  }
}

export async function appendShotToBoard(
  roomId: string,
  targetUserId: string,
  shotsList: Array<[string, CellState]>,
  ships: Ship[]
): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  await sb
    .from("team_room_members")
    .update({ board_state: { ships, shots: shotsList } })
    .eq("room_id", roomId)
    .eq("user_id", targetUserId);
}

export async function fetchTeamChat(roomId: string): Promise<TeamChatRow[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data } = await sb
    .from("team_chat")
    .select("*")
    .eq("room_id", roomId)
    .order("created_at", { ascending: true });
  return (data as TeamChatRow[] | null) ?? [];
}

export async function sendTeamChat(
  roomId: string,
  userId: string,
  username: string,
  team: 1 | 2 | null,
  text: string
): Promise<TeamChatRow | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const trimmed = text.trim().slice(0, 200);
  if (!trimmed) return null;
  const { data, error } = await sb
    .from("team_chat")
    .insert({ room_id: roomId, user_id: userId, username, team, text: trimmed })
    .select()
    .single();
  if (error || !data) return null;
  return data as TeamChatRow;
}

// Compute the user_id whose turn it is given an array of alive members
// rotated through team1[0], team2[0], team1[1], team2[1], …
export function userIdAtTurn(
  members: TeamRoomMemberRow[],
  turnIndex: number
): string | null {
  const team1 = members.filter((m) => m.team === 1 && m.alive).sort(byJoined);
  const team2 = members.filter((m) => m.team === 2 && m.alive).sort(byJoined);
  if (team1.length === 0 || team2.length === 0) return null;
  // Build the rotation: pair index i pulls team1[i % team1.length] then team2[i % team2.length]
  const order: TeamRoomMemberRow[] = [];
  const slots = Math.max(team1.length, team2.length);
  for (let i = 0; i < slots; i++) {
    if (team1[i % team1.length]) order.push(team1[i % team1.length]);
    if (team2[i % team2.length]) order.push(team2[i % team2.length]);
  }
  if (order.length === 0) return null;
  return order[turnIndex % order.length].user_id;
}

function byJoined(a: TeamRoomMemberRow, b: TeamRoomMemberRow) {
  return a.joined_at.localeCompare(b.joined_at);
}
