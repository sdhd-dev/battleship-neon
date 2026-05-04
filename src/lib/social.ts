"use client";

import { LocalProfile, loadProfile, saveProfile, syncCloudProfile } from "./storage";
import { emitCoinGain } from "./economy";
import { getSupabase, supabaseEnabled } from "./supabase/client";

// ── Reward amounts ────────────────────────────────────────────
export const SHARE_LINK_REWARD = 10; // first-time copy of personal invite link
export const POSTED_PLATFORM_REWARD = 25; // honor-system "I posted!" claim

// ── Local persistence keys ────────────────────────────────────
const SHARE_LINK_KEY = "bs.social.linkCopied";   // "1" once user has earned it
const PLATFORM_LOG_KEY = "bs.social.platformLog"; // { [platform]: "YYYY-MM-DD" }

export type SocialPlatform = "twitter" | "instagram" | "tiktok";

export interface PlatformDef {
  id: SocialPlatform;
  label: string;
  emoji: string;
  shareUrl: (text: string, link: string) => string;
}

// Pre-written copy. Users can edit before posting.
export const DEFAULT_POST_TEXT =
  "I just sank a fleet on Battleship.Neon ⚓ — neon Battleship vs AI commanders & live PvP. Join me 👇";

export const PLATFORMS: PlatformDef[] = [
  {
    id: "twitter",
    label: "Twitter / X",
    emoji: "𝕏",
    shareUrl: (text, link) =>
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(link)}`,
  },
  {
    id: "instagram",
    // Instagram has no web share intent — we copy the caption + open the app.
    label: "Instagram",
    emoji: "📸",
    shareUrl: () => `https://www.instagram.com/`,
  },
  {
    id: "tiktok",
    // TikTok also has no share intent — open the upload page.
    label: "TikTok",
    emoji: "🎵",
    shareUrl: () => `https://www.tiktok.com/upload`,
  },
];

// ── UTC day helper ────────────────────────────────────────────
function utcDay(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

// ── Invite-link copy reward (one-time, +10) ───────────────────
export function hasClaimedShareLinkReward(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(SHARE_LINK_KEY) === "1";
}

export function claimShareLinkReward(): { awarded: boolean; profile: LocalProfile } {
  const profile = loadProfile();
  if (hasClaimedShareLinkReward()) return { awarded: false, profile };
  const next: LocalProfile = {
    ...profile,
    coins: (profile.coins ?? 0) + SHARE_LINK_REWARD,
  };
  saveProfile(next);
  if (typeof window !== "undefined") localStorage.setItem(SHARE_LINK_KEY, "1");
  void syncCloudProfile(next);
  emitCoinGain(SHARE_LINK_REWARD, "Share link");
  return { awarded: true, profile: next };
}

// ── Platform "I posted!" reward (1 per platform per UTC day) ──
type PlatformLog = Partial<Record<SocialPlatform, string>>;

function loadPlatformLog(): PlatformLog {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(PLATFORM_LOG_KEY) || "{}") as PlatformLog;
  } catch {
    return {};
  }
}

function savePlatformLog(log: PlatformLog) {
  if (typeof window === "undefined") return;
  localStorage.setItem(PLATFORM_LOG_KEY, JSON.stringify(log));
}

export function platformClaimedToday(platform: SocialPlatform): boolean {
  const log = loadPlatformLog();
  return log[platform] === utcDay();
}

export function claimPlatformPostReward(
  platform: SocialPlatform
): { awarded: boolean; profile: LocalProfile } {
  const profile = loadProfile();
  if (platformClaimedToday(platform)) return { awarded: false, profile };
  const next: LocalProfile = {
    ...profile,
    coins: (profile.coins ?? 0) + POSTED_PLATFORM_REWARD,
  };
  saveProfile(next);
  const log = loadPlatformLog();
  log[platform] = utcDay();
  savePlatformLog(log);
  void syncCloudProfile(next);
  emitCoinGain(POSTED_PLATFORM_REWARD, `Posted to ${platform}`);
  return { awarded: true, profile: next };
}

// ── Viral claim submission ────────────────────────────────────
export type ClaimStatus = "pending" | "approved" | "rejected" | "paid";

export interface ViralClaim {
  id: string;
  username: string;
  platform: SocialPlatform;
  postUrl: string;
  screenshotUrl: string;
  payoutMethod?: string | null;
  payoutHandle?: string | null;
  note?: string | null;
  status: ClaimStatus;
  rewardAmountUsd?: number | null;
  createdAt: number;
  reviewedAt?: number | null;
  paidAt?: number | null;
}

interface SubmitInput {
  username: string;
  platform: SocialPlatform;
  postUrl: string;
  screenshotFile: File;
  payoutMethod: string;
  payoutHandle: string;
  note?: string;
}

export async function submitViralClaim(
  input: SubmitInput
): Promise<{ ok: boolean; error?: string; claim?: ViralClaim }> {
  if (!supabaseEnabled()) {
    return { ok: false, error: "Cloud sync disabled — viral claims need Supabase." };
  }
  const sb = getSupabase();
  if (!sb) return { ok: false, error: "Supabase client unavailable." };

  const username = input.username.trim().toLowerCase();
  if (!username) return { ok: false, error: "Sign in first to submit a claim." };

  // 1. Upload screenshot to storage.
  const ext = input.screenshotFile.name.split(".").pop()?.toLowerCase() || "png";
  const path = `${username}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error: upErr } = await sb.storage
    .from("viral-screenshots")
    .upload(path, input.screenshotFile, {
      contentType: input.screenshotFile.type || "image/png",
      cacheControl: "3600",
      upsert: false,
    });
  if (upErr) return { ok: false, error: `Upload failed: ${upErr.message}` };

  const { data: pub } = sb.storage.from("viral-screenshots").getPublicUrl(path);
  const screenshotUrl = pub.publicUrl;

  // 2. Insert the claim row.
  const { data, error } = await sb
    .from("viral_claims")
    .insert({
      username,
      platform: input.platform,
      post_url: input.postUrl.trim(),
      screenshot_url: screenshotUrl,
      payout_method: input.payoutMethod.trim(),
      payout_handle: input.payoutHandle.trim(),
      note: input.note?.trim() || null,
      status: "pending",
    })
    .select(
      "id,username,platform,post_url,screenshot_url,payout_method,payout_handle,note,status,reward_amount_usd,created_at,reviewed_at,paid_at"
    )
    .maybeSingle();

  if (error || !data) {
    return { ok: false, error: error?.message || "Could not save claim." };
  }
  return { ok: true, claim: rowToClaim(data) };
}

export async function fetchMyViralClaims(username: string): Promise<ViralClaim[]> {
  if (!supabaseEnabled()) return [];
  const sb = getSupabase();
  if (!sb) return [];
  const me = username.trim().toLowerCase();
  if (!me) return [];
  const { data, error } = await sb
    .from("viral_claims")
    .select(
      "id,username,platform,post_url,screenshot_url,payout_method,payout_handle,note,status,reward_amount_usd,created_at,reviewed_at,paid_at"
    )
    .eq("username", me)
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return data.map(rowToClaim);
}

// Pulled from the server to render 🔥 Viral Creator badges on the leaderboard.
export async function fetchViralCreators(): Promise<Set<string>> {
  if (!supabaseEnabled()) return new Set();
  const sb = getSupabase();
  if (!sb) return new Set();
  const { data, error } = await sb
    .from("profiles")
    .select("username")
    .eq("viral_creator", true);
  if (error || !data) return new Set();
  return new Set(data.map((d) => (d.username as string | null)?.toLowerCase()).filter(Boolean) as string[]);
}

interface ViralClaimRow {
  id: string;
  username: string;
  platform: string;
  post_url: string;
  screenshot_url: string;
  payout_method: string | null;
  payout_handle: string | null;
  note: string | null;
  status: string;
  reward_amount_usd: number | null;
  created_at: string;
  reviewed_at: string | null;
  paid_at: string | null;
}

function rowToClaim(d: ViralClaimRow): ViralClaim {
  return {
    id: d.id,
    username: d.username,
    platform: d.platform as SocialPlatform,
    postUrl: d.post_url,
    screenshotUrl: d.screenshot_url,
    payoutMethod: d.payout_method,
    payoutHandle: d.payout_handle,
    note: d.note,
    status: (d.status as ClaimStatus) || "pending",
    rewardAmountUsd: d.reward_amount_usd,
    createdAt: new Date(d.created_at).getTime(),
    reviewedAt: d.reviewed_at ? new Date(d.reviewed_at).getTime() : null,
    paidAt: d.paid_at ? new Date(d.paid_at).getTime() : null,
  };
}
