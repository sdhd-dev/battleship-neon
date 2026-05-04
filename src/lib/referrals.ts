"use client";

import { LocalProfile, loadProfile, saveProfile, syncCloudProfile } from "./storage";
import { getSupabase, supabaseEnabled } from "./supabase/client";
import { emitCoinGain } from "./economy";

const PENDING_REF_KEY = "bs.referral.pending";
export const REFERRAL_REWARD = 50;

export function buildInviteUrl(username: string): string {
  const code = encodeURIComponent(username.trim().toLowerCase());
  if (typeof window === "undefined") return `/join?ref=${code}`;
  return `${window.location.origin}/join?ref=${code}`;
}

export function stashPendingReferral(code: string) {
  if (typeof window === "undefined") return;
  const c = code.trim().toLowerCase();
  if (!c) return;
  localStorage.setItem(PENDING_REF_KEY, c);
}

export function consumePendingReferral(): string | null {
  if (typeof window === "undefined") return null;
  const v = localStorage.getItem(PENDING_REF_KEY);
  if (v) localStorage.removeItem(PENDING_REF_KEY);
  return v;
}

export function peekPendingReferral(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(PENDING_REF_KEY);
}

// Called from AuthProvider after a successful brand-new signUp.
// Credits the new user (+50) and records a referrals row so the inviter
// can self-credit on their next session.
export async function processReferralOnSignup(newUsername: string) {
  const code = consumePendingReferral();
  if (!code) return;
  const me = newUsername.trim().toLowerCase();
  if (!me || code === me) return;

  const profile = loadProfile();
  // Already credited on a previous attempt? Skip.
  if (profile.referredBy) return;
  const next: LocalProfile = {
    ...profile,
    coins: (profile.coins ?? 0) + REFERRAL_REWARD,
    referredBy: code,
  };
  saveProfile(next);
  void syncCloudProfile(next);
  emitCoinGain(REFERRAL_REWARD, "Referral bonus");

  if (!supabaseEnabled()) return;
  const sb = getSupabase();
  if (!sb) return;
  // unique on invited_username — duplicate insert is silently rejected.
  await sb
    .from("referrals")
    .insert({
      referrer_username: code,
      invited_username: me,
      awarded: false,
    })
    .then(() => undefined, () => undefined);
}

// Called on every authenticated session start. If anyone signed up with
// my code while I was away, claim the pending +50 bonuses now.
export async function claimPendingReferralRewards(myUsername: string) {
  if (!supabaseEnabled()) return;
  const sb = getSupabase();
  if (!sb) return;
  const me = myUsername.trim().toLowerCase();
  if (!me) return;
  const { data } = await sb
    .from("referrals")
    .select("id,invited_username")
    .eq("referrer_username", me)
    .eq("awarded", false);
  if (!data || data.length === 0) return;

  const total = data.length * REFERRAL_REWARD;
  const profile = loadProfile();
  const next: LocalProfile = {
    ...profile,
    coins: (profile.coins ?? 0) + total,
  };
  saveProfile(next);
  void syncCloudProfile(next);
  emitCoinGain(total, `${data.length} referral bonus${data.length === 1 ? "" : "es"}`);

  await sb
    .from("referrals")
    .update({ awarded: true })
    .in("id", data.map((r) => r.id))
    .then(() => undefined, () => undefined);
}

export interface ReferralStats {
  count: number;
  coinsEarned: number;
}

export async function fetchReferralStats(myUsername: string): Promise<ReferralStats> {
  if (!supabaseEnabled()) return { count: 0, coinsEarned: 0 };
  const sb = getSupabase();
  if (!sb) return { count: 0, coinsEarned: 0 };
  const me = myUsername.trim().toLowerCase();
  if (!me) return { count: 0, coinsEarned: 0 };
  const { data } = await sb
    .from("referrals")
    .select("id")
    .eq("referrer_username", me);
  const count = data?.length ?? 0;
  return { count, coinsEarned: count * REFERRAL_REWARD };
}
