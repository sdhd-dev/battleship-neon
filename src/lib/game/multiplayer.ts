"use client";

import { getSupabase, supabaseEnabled } from "@/lib/supabase/client";
import { CellState, ShipType } from "./types";

const PLAYER_ID_KEY = "bs.mp.playerId";

export type RoomStatus = "waiting" | "placing" | "playing" | "finished";

export interface RoomRow {
  id: string;
  player1_id: string;
  player2_id: string | null;
  player1_name: string | null;
  player2_name: string | null;
  status: RoomStatus;
  game_state: unknown;
  created_at: string;
}

export interface MessageRow {
  id: string;
  room_id: string;
  player_id: string;
  player_name: string | null;
  text: string;
  created_at: string;
}

export interface ShootPayload {
  fromId: string;
  r: number;
  c: number;
}

export interface ShotResultPayload {
  fromId: string;
  r: number;
  c: number;
  state: CellState;
  sunkShipType?: ShipType;
  sunkShipCells?: Array<[number, number]>;
  // Custom-ship metadata revealed to the attacker only when the ship is
  // sunk — gives them a glimpse of the captain's signature vessel.
  sunkShipCustomName?: string;
  sunkShipCustomSkin?: string;
  sunkShipCustomBadge?: string;
  allSunk: boolean;
}

function newGuestId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `g_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
  }
}

export function getOrCreateGuestId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem(PLAYER_ID_KEY);
  if (!id) {
    id = newGuestId();
    localStorage.setItem(PLAYER_ID_KEY, id);
  }
  return id;
}

export async function getCurrentPlayerId(): Promise<string> {
  if (typeof window === "undefined") return "";
  if (supabaseEnabled()) {
    const sb = getSupabase();
    if (sb) {
      const { data } = await sb.auth.getUser();
      if (data.user?.id) return data.user.id;
    }
  }
  return getOrCreateGuestId();
}

export async function createRoom(
  playerId: string,
  playerName: string
): Promise<RoomRow | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb
    .from("rooms")
    .insert({
      player1_id: playerId,
      player1_name: playerName,
      status: "waiting",
    })
    .select()
    .single();
  if (error || !data) return null;
  return data as RoomRow;
}

export async function fetchRoom(roomId: string): Promise<RoomRow | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb
    .from("rooms")
    .select("*")
    .eq("id", roomId)
    .maybeSingle();
  if (error) return null;
  return (data as RoomRow | null) ?? null;
}

export async function joinRoom(
  roomId: string,
  playerId: string,
  playerName: string
): Promise<RoomRow | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const existing = await fetchRoom(roomId);
  if (!existing) return null;
  if (existing.player1_id === playerId || existing.player2_id === playerId) {
    return existing;
  }
  if (existing.player2_id) return null;
  // Race-safe: only update if player2_id is still null.
  const { data, error } = await sb
    .from("rooms")
    .update({
      player2_id: playerId,
      player2_name: playerName,
      status: "placing",
    })
    .eq("id", roomId)
    .is("player2_id", null)
    .select()
    .single();
  if (error || !data) {
    const recheck = await fetchRoom(roomId);
    return recheck && recheck.player2_id === playerId ? recheck : null;
  }
  return data as RoomRow;
}

export async function setRoomStatus(roomId: string, status: RoomStatus) {
  const sb = getSupabase();
  if (!sb) return;
  await sb.from("rooms").update({ status }).eq("id", roomId);
}

export async function sendMessage(
  roomId: string,
  playerId: string,
  playerName: string,
  text: string
): Promise<MessageRow | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const trimmed = text.trim().slice(0, 200);
  if (!trimmed) return null;
  const { data, error } = await sb
    .from("messages")
    .insert({
      room_id: roomId,
      player_id: playerId,
      player_name: playerName,
      text: trimmed,
    })
    .select()
    .single();
  if (error || !data) return null;
  return data as MessageRow;
}

export async function fetchMessages(roomId: string): Promise<MessageRow[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from("messages")
    .select("*")
    .eq("room_id", roomId)
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return data as MessageRow[];
}

export async function clearMessages(roomId: string) {
  const sb = getSupabase();
  if (!sb) return;
  await sb.from("messages").delete().eq("room_id", roomId);
}
