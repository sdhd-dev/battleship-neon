"use client";

import { getSupabase, supabaseEnabled } from "./supabase/client";
import { currentWeekStart, weekStartIso } from "./tournament";
import { loadProfile, saveProfile, syncCloudProfile } from "./storage";
import { notify } from "./notify";

export const MIN_CLAN_DONATION = 10;

export interface ClanRow {
  id: string;
  name: string;
  tag: string;
  emblem: string;
  color: string;
  description: string;
  leader_id: string;
  bank_coins: number;
  total_wins: number;
  created_at: string;
}

export interface ClanMemberRow {
  clan_id: string;
  user_id: string;
  username: string;
  role: "leader" | "officer" | "member";
  joined_at: string;
  contributed_coins: number;
}

export interface ClanChatRow {
  id: string;
  clan_id: string;
  user_id: string;
  username: string;
  text: string;
  created_at: string;
}

export interface ClanMissionRow {
  id: string;
  clan_id: string;
  mission_type: string;
  target: number;
  progress: number;
  reward_coins: number;
  completed: boolean;
  week_start: string;
  created_at: string;
}

export interface ClanDonationRow {
  id: string;
  clan_id: string;
  user_id: string;
  username: string;
  amount: number;
  created_at: string;
}

export interface ClanWarRow {
  id: string;
  clan1_id: string;
  clan2_id: string;
  clan1_score: number;
  clan2_score: number;
  week_start: string;
  winner_clan_id: string | null;
  created_at: string;
}

const TAG_RE = /^[A-Z0-9]{2,4}$/;

export function validateClanInput(name: string, tag: string): string | null {
  const n = name.trim();
  const t = tag.trim().toUpperCase();
  if (n.length < 3) return "Clan name must be 3+ characters.";
  if (n.length > 32) return "Clan name too long (max 32).";
  if (!TAG_RE.test(t)) return "Tag must be 2–4 uppercase letters/digits.";
  return null;
}

export async function authedUserId(): Promise<string | null> {
  if (!supabaseEnabled()) return null;
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getUser();
  return data.user?.id ?? null;
}

export async function getMyClan(): Promise<{ clan: ClanRow; member: ClanMemberRow } | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const uid = await authedUserId();
  if (!uid) return null;
  const { data: m, error } = await sb
    .from("clan_members")
    .select("*")
    .eq("user_id", uid)
    .maybeSingle();
  if (error || !m) return null;
  const member = m as ClanMemberRow;
  const { data: c } = await sb
    .from("clans")
    .select("*")
    .eq("id", member.clan_id)
    .maybeSingle();
  if (!c) return null;
  return { clan: c as ClanRow, member };
}

export async function getClanByUsername(username: string): Promise<ClanRow | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const u = username.trim().toLowerCase();
  if (!u) return null;
  const { data: m } = await sb
    .from("clan_members")
    .select("clan_id")
    .ilike("username", u)
    .maybeSingle();
  if (!m) return null;
  const { data: c } = await sb
    .from("clans")
    .select("*")
    .eq("id", (m as { clan_id: string }).clan_id)
    .maybeSingle();
  return (c as ClanRow | null) ?? null;
}

export async function fetchClansByUsernames(
  usernames: string[]
): Promise<Map<string, ClanRow>> {
  const out = new Map<string, ClanRow>();
  const sb = getSupabase();
  if (!sb) return out;
  const lowered = Array.from(
    new Set(usernames.map((u) => u.trim().toLowerCase()).filter(Boolean))
  );
  if (lowered.length === 0) return out;
  const { data: members } = await sb
    .from("clan_members")
    .select("username,clan_id")
    .in("username", lowered);
  if (!members || members.length === 0) {
    // case-insensitive fallback
    for (const u of lowered) {
      const c = await getClanByUsername(u);
      if (c) out.set(u, c);
    }
    return out;
  }
  const clanIds = Array.from(new Set(members.map((m) => (m as { clan_id: string }).clan_id)));
  const { data: clans } = await sb
    .from("clans")
    .select("*")
    .in("id", clanIds);
  if (!clans) return out;
  const clanById = new Map(clans.map((c) => [(c as ClanRow).id, c as ClanRow]));
  for (const m of members) {
    const row = m as { username: string; clan_id: string };
    const clan = clanById.get(row.clan_id);
    if (clan) out.set(row.username.toLowerCase(), clan);
  }
  return out;
}

export async function listClans(query?: string, limit = 20): Promise<ClanRow[]> {
  const sb = getSupabase();
  if (!sb) return [];
  let q = sb.from("clans").select("*").order("total_wins", { ascending: false }).limit(limit);
  const trimmed = query?.trim();
  if (trimmed) {
    const safe = trimmed.replace(/[%_]/g, "");
    q = q.or(`name.ilike.%${safe}%,tag.ilike.%${safe}%`);
  }
  const { data } = await q;
  return (data as ClanRow[] | null) ?? [];
}

export async function fetchClanLeaderboard(limit = 50): Promise<ClanRow[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data } = await sb
    .from("clans")
    .select("*")
    .order("total_wins", { ascending: false })
    .limit(limit);
  return (data as ClanRow[] | null) ?? [];
}

export async function fetchClanMembers(clanId: string): Promise<ClanMemberRow[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data } = await sb
    .from("clan_members")
    .select("*")
    .eq("clan_id", clanId)
    .order("joined_at", { ascending: true });
  return (data as ClanMemberRow[] | null) ?? [];
}

export async function fetchClanById(clanId: string): Promise<ClanRow | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.from("clans").select("*").eq("id", clanId).maybeSingle();
  return (data as ClanRow | null) ?? null;
}

export interface CreateClanInput {
  name: string;
  tag: string;
  emblem: string;
  color: string;
  description: string;
  leaderUsername: string;
}

export async function createClan(input: CreateClanInput): Promise<{ ok: boolean; error?: string; clan?: ClanRow }> {
  const v = validateClanInput(input.name, input.tag);
  if (v) return { ok: false, error: v };
  const sb = getSupabase();
  if (!sb) return { ok: false, error: "Cloud sync is off." };
  const uid = await authedUserId();
  if (!uid) return { ok: false, error: "Sign in to create a clan." };

  // Already in a clan?
  const existing = await getMyClan();
  if (existing) return { ok: false, error: "Leave your current clan first." };

  const tag = input.tag.trim().toUpperCase();
  const { data, error } = await sb
    .from("clans")
    .insert({
      name: input.name.trim(),
      tag,
      emblem: input.emblem || "⚓",
      color: input.color || "#00f0ff",
      description: input.description.slice(0, 200),
      leader_id: uid,
    })
    .select()
    .single();
  if (error || !data) {
    if (error && /duplicate|unique/i.test(error.message)) {
      return { ok: false, error: "Name or tag already taken." };
    }
    return { ok: false, error: error?.message ?? "Could not create clan." };
  }
  const clan = data as ClanRow;

  await sb.from("clan_members").upsert({
    clan_id: clan.id,
    user_id: uid,
    username: input.leaderUsername,
    role: "leader",
  });

  // Bootstrap a weekly mission so the clan has something to grind.
  await sb.from("clan_missions").insert({
    clan_id: clan.id,
    mission_type: "wins",
    target: 50,
    progress: 0,
    reward_coins: 500,
    week_start: weekStartIso(),
  });

  return { ok: true, clan };
}

export async function joinClan(
  clanId: string,
  username: string
): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabase();
  if (!sb) return { ok: false, error: "Cloud sync is off." };
  const uid = await authedUserId();
  if (!uid) return { ok: false, error: "Sign in to join a clan." };
  const existing = await getMyClan();
  if (existing) return { ok: false, error: "Leave your current clan first." };

  const { error } = await sb.from("clan_members").upsert({
    clan_id: clanId,
    user_id: uid,
    username,
    role: "member",
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function leaveClan(): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabase();
  if (!sb) return { ok: false, error: "Cloud sync is off." };
  const uid = await authedUserId();
  if (!uid) return { ok: false, error: "Not signed in." };
  const my = await getMyClan();
  if (!my) return { ok: false, error: "Not in a clan." };

  // If the leader leaves and there are other members, hand off leadership.
  if (my.member.role === "leader") {
    const members = await fetchClanMembers(my.clan.id);
    const others = members.filter((m) => m.user_id !== uid);
    if (others.length > 0) {
      const heir = others.find((m) => m.role === "officer") ?? others[0];
      await sb.from("clan_members").update({ role: "leader" }).eq("user_id", heir.user_id);
      await sb.from("clans").update({ leader_id: heir.user_id }).eq("id", my.clan.id);
    } else {
      // Last member out — disband the clan.
      await sb.from("clans").delete().eq("id", my.clan.id);
      return { ok: true };
    }
  }

  await sb.from("clan_members").delete().eq("user_id", uid);
  return { ok: true };
}

export async function donateToClan(amount: number): Promise<{ ok: boolean; error?: string }> {
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "Enter a positive amount." };
  }
  if (amount < MIN_CLAN_DONATION) {
    const msg = `Minimum donation is ${MIN_CLAN_DONATION} coins.`;
    notify(msg, "error");
    return { ok: false, error: msg };
  }
  const sb = getSupabase();
  if (!sb) return { ok: false, error: "Cloud sync is off." };
  const uid = await authedUserId();
  if (!uid) return { ok: false, error: "Not signed in." };
  const my = await getMyClan();
  if (!my) return { ok: false, error: "Not in a clan." };

  const before = loadProfile();
  const balance = before.coins ?? 0;
  if (balance < amount) {
    notify("Insufficient coins", "error");
    return { ok: false, error: "Insufficient coins" };
  }

  // Optimistic local deduction so the UI reflects the spend immediately.
  saveProfile({ ...before, coins: balance - amount });

  const { data, error } = await sb.rpc("clan_donate", {
    p_clan_id: my.clan.id,
    p_user_id: uid,
    p_amount: amount,
  });

  const result = (data ?? null) as { ok?: boolean; error?: string } | null;
  if (error || (result && result.ok === false)) {
    // Revert local optimistic update on failure.
    saveProfile(before);
    const reason =
      result?.error === "insufficient"
        ? "Insufficient coins"
        : error?.message ?? "Donation failed";
    notify(reason, "error");
    return { ok: false, error: reason };
  }

  // Re-pull cloud truth to keep coins exactly aligned with the server,
  // then mirror back to localStorage and broadcast a profile change.
  const next = loadProfile();
  void syncCloudProfile(next);
  notify(`⚓ ${amount.toLocaleString()} coins donated to clan bank!`, "success");
  return { ok: true };
}

export async function distributeBank(
  amountPerMember: number
): Promise<{ ok: boolean; error?: string; perMember?: number; members?: number }> {
  const sb = getSupabase();
  if (!sb) return { ok: false, error: "Cloud sync is off." };
  const uid = await authedUserId();
  if (!uid) return { ok: false, error: "Not signed in." };
  const my = await getMyClan();
  if (!my) return { ok: false, error: "Not in a clan." };
  if (my.member.role !== "leader" && my.member.role !== "officer") {
    return { ok: false, error: "Only leaders/officers can distribute." };
  }
  if (amountPerMember <= 0) return { ok: false, error: "Enter a positive amount." };

  const members = await fetchClanMembers(my.clan.id);
  const total = amountPerMember * members.length;
  if (my.clan.bank_coins < total) {
    return { ok: false, error: "Not enough coins in the bank." };
  }

  const { error } = await sb.rpc("clan_distribute", {
    p_clan_id: my.clan.id,
    p_amount: amountPerMember,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, perMember: amountPerMember, members: members.length };
}

// Sends bank coins to a single clan member's profile balance. Used by
// "Distribute to member" (leader picks a recipient) and "Withdraw"
// (leader sends to themselves). Caller-side gate: leader/officer only.
export async function sendBankToMember(
  targetUserId: string,
  amount: number
): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabase();
  if (!sb) return { ok: false, error: "Cloud sync is off." };
  const uid = await authedUserId();
  if (!uid) return { ok: false, error: "Not signed in." };
  const my = await getMyClan();
  if (!my) return { ok: false, error: "Not in a clan." };
  if (my.member.role !== "leader" && my.member.role !== "officer") {
    return { ok: false, error: "Only leaders/officers can withdraw." };
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "Enter a positive amount." };
  }
  if (my.clan.bank_coins < amount) {
    return { ok: false, error: "Not enough coins in the bank." };
  }

  const { error } = await sb.rpc("clan_send_to_member", {
    p_clan_id: my.clan.id,
    p_target_user_id: targetUserId,
    p_amount: amount,
  });
  if (error) return { ok: false, error: error.message };

  // If the recipient is the caller, refresh local profile so the UI
  // reflects the credited coins immediately.
  if (targetUserId === uid) {
    const local = loadProfile();
    saveProfile({ ...local, coins: (local.coins ?? 0) + amount });
    void syncCloudProfile({ ...local, coins: (local.coins ?? 0) + amount });
  }
  return { ok: true };
}

export async function withdrawFromBank(
  amount: number
): Promise<{ ok: boolean; error?: string }> {
  const uid = await authedUserId();
  if (!uid) return { ok: false, error: "Not signed in." };
  return sendBankToMember(uid, amount);
}

// Returns the top contributor for the current week (Mon-anchored UTC),
// based on rows in clan_donations. Falls back to null when no donations
// have been made this week.
export async function fetchTopWeeklyDonor(
  clanId: string
): Promise<{ username: string; user_id: string; total: number } | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const since = currentWeekStart().toISOString();
  const { data } = await sb
    .from("clan_donations")
    .select("user_id,username,amount")
    .eq("clan_id", clanId)
    .gte("created_at", since);
  const rows = (data as Pick<ClanDonationRow, "user_id" | "username" | "amount">[] | null) ?? [];
  if (rows.length === 0) return null;
  const totals = new Map<string, { username: string; total: number }>();
  for (const r of rows) {
    const cur = totals.get(r.user_id);
    if (cur) cur.total += r.amount;
    else totals.set(r.user_id, { username: r.username, total: r.amount });
  }
  let bestId = "";
  let best = { username: "", total: 0 };
  for (const [uid, agg] of totals) {
    if (agg.total > best.total) {
      best = agg;
      bestId = uid;
    }
  }
  if (!bestId) return null;
  return { username: best.username, user_id: bestId, total: best.total };
}

export async function fetchClanChat(clanId: string, limit = 80): Promise<ClanChatRow[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data } = await sb
    .from("clan_chat")
    .select("*")
    .eq("clan_id", clanId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return ((data as ClanChatRow[] | null) ?? []).reverse();
}

export async function sendClanChat(
  clanId: string,
  username: string,
  text: string
): Promise<ClanChatRow | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const uid = await authedUserId();
  if (!uid) return null;
  const trimmed = text.trim().slice(0, 240);
  if (!trimmed) return null;
  const { data, error } = await sb
    .from("clan_chat")
    .insert({ clan_id: clanId, user_id: uid, username, text: trimmed })
    .select()
    .single();
  if (error || !data) return null;
  return data as ClanChatRow;
}

export async function fetchClanMissions(clanId: string): Promise<ClanMissionRow[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const week = weekStartIso();
  const { data } = await sb
    .from("clan_missions")
    .select("*")
    .eq("clan_id", clanId)
    .eq("week_start", week)
    .order("created_at", { ascending: true });
  return (data as ClanMissionRow[] | null) ?? [];
}

export async function ensureWeeklyMission(clanId: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const week = weekStartIso();
  const { data } = await sb
    .from("clan_missions")
    .select("id")
    .eq("clan_id", clanId)
    .eq("week_start", week)
    .limit(1);
  if (data && data.length > 0) return;
  await sb.from("clan_missions").insert({
    clan_id: clanId,
    mission_type: "wins",
    target: 50,
    progress: 0,
    reward_coins: 500,
    week_start: week,
  });
}

// Called from the game flow after a PvP win to bump clan stats and
// progress mission counters. Best-effort — silent on failure.
export async function bumpClanWin(): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const my = await getMyClan();
  if (!my) return;
  await sb.rpc("clan_record_win", { p_clan_id: my.clan.id });
}

// Returns true if `opponentUsername` belongs to a different clan than
// the current user. Used to award the +20% rival-clan boost.
export async function rivalClanBoost(opponentUsername: string): Promise<boolean> {
  const my = await getMyClan();
  if (!my) return false;
  const oppClan = await getClanByUsername(opponentUsername);
  if (!oppClan) return false;
  return oppClan.id !== my.clan.id;
}

export async function fetchClanWar(clanId: string): Promise<{
  war: ClanWarRow;
  opponent: ClanRow | null;
} | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const week = weekStartIso();
  const { data } = await sb
    .from("clan_wars")
    .select("*")
    .or(`clan1_id.eq.${clanId},clan2_id.eq.${clanId}`)
    .eq("week_start", week)
    .order("created_at", { ascending: false })
    .limit(1);
  if (!data || data.length === 0) return null;
  const war = data[0] as ClanWarRow;
  const oppId = war.clan1_id === clanId ? war.clan2_id : war.clan1_id;
  const opponent = await fetchClanById(oppId);
  return { war, opponent };
}

export async function fetchTopWarWinners(limit = 5): Promise<ClanWarRow[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data } = await sb
    .from("clan_wars")
    .select("*")
    .not("winner_clan_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data as ClanWarRow[] | null) ?? [];
}
