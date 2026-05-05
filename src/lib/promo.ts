"use client";

import { getSupabase, supabaseEnabled } from "./supabase/client";
import { findItem } from "./shop-catalog";

export type PromoErrorCode =
  | "invalid"
  | "expired"
  | "already_used"
  | "max_uses"
  | "auth"
  | "cloud_off"
  | "unknown";

export interface PromoSuccess {
  ok: true;
  rewardCoins: number;
  rewardCosmetic: string | null;
  cosmeticName: string | null;
}

export interface PromoFailure {
  ok: false;
  error: PromoErrorCode;
  message: string;
}

export type PromoResult = PromoSuccess | PromoFailure;

const ERROR_MESSAGES: Record<PromoErrorCode, string> = {
  invalid: "Invalid code",
  expired: "Expired",
  already_used: "Already used",
  max_uses: "Max uses reached",
  auth: "Sign in to redeem promo codes.",
  cloud_off: "Cloud sync is off — promo codes need Supabase.",
  unknown: "Could not redeem code. Try again.",
};

function fail(code: PromoErrorCode): PromoFailure {
  return { ok: false, error: code, message: ERROR_MESSAGES[code] };
}

export async function redeemPromoCode(rawCode: string): Promise<PromoResult> {
  const code = rawCode.trim().toUpperCase();
  if (!code) return fail("invalid");

  if (!supabaseEnabled()) return fail("cloud_off");
  const sb = getSupabase();
  if (!sb) return fail("cloud_off");

  const { data: userData } = await sb.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return fail("auth");

  const { data, error } = await sb.rpc("redeem_promo_code", {
    p_code: code,
    p_user_id: userId,
  });

  if (error || !data) return fail("unknown");

  const payload = data as {
    ok: boolean;
    error?: PromoErrorCode;
    reward_coins?: number;
    reward_cosmetic?: string | null;
  };

  if (!payload.ok) {
    const ec = (payload.error ?? "unknown") as PromoErrorCode;
    return fail(ec in ERROR_MESSAGES ? ec : "unknown");
  }

  const rewardCosmetic = payload.reward_cosmetic ?? null;
  const cosmeticName = rewardCosmetic
    ? findItem(rewardCosmetic)?.name ?? rewardCosmetic
    : null;

  return {
    ok: true,
    rewardCoins: payload.reward_coins ?? 0,
    rewardCosmetic,
    cosmeticName,
  };
}
