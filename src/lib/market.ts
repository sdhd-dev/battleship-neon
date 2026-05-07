"use client";

import { getSupabase, supabaseEnabled } from "./supabase/client";
import {
  CustomShip,
  LocalProfile,
  loadProfile,
  refreshProfileFromCloud,
  saveProfile,
  syncCloudProfile,
} from "./storage";
import { PowerType, readInventory } from "./powers";
import { notify } from "./notify";

export const MIN_PRICE = 10;
export const MAX_PRICE = 9999;

export type ItemType = "power" | "ship";

export interface PowerListingData {
  type: PowerType;
}

export type ShipListingData = CustomShip;

export interface MarketListing {
  id: string;
  seller_id: string;
  seller_username: string;
  item_type: ItemType;
  item_data: PowerListingData | ShipListingData | Record<string, unknown>;
  price: number;
  status: "active" | "sold" | "cancelled";
  buyer_id: string | null;
  buyer_username: string | null;
  created_at: string;
  sold_at: string | null;
}

async function authedUserId(): Promise<string | null> {
  if (!supabaseEnabled()) return null;
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getUser();
  return data.user?.id ?? null;
}

export function validatePrice(price: number): string | null {
  if (!Number.isFinite(price)) return "Enter a valid price.";
  const n = Math.floor(price);
  if (n < MIN_PRICE) return `Min price is ${MIN_PRICE} coins.`;
  if (n > MAX_PRICE) return `Max price is ${MAX_PRICE} coins.`;
  return null;
}

// Optimistically remove one of `type` from local inventory. Returns null
// if the seller doesn't actually own the item.
function localRemovePower(
  profile: LocalProfile,
  type: PowerType
): LocalProfile | null {
  const inv = readInventory(profile);
  const existing = inv.find((e) => e.type === type);
  if (!existing || existing.count <= 0) return null;
  const next = inv
    .map((e) => (e.type === type ? { ...e, count: e.count - 1 } : e))
    .filter((e) => e.count > 0);
  return { ...profile, powers: next };
}

function localAddPower(profile: LocalProfile, type: PowerType): LocalProfile {
  const inv = readInventory(profile);
  const existing = inv.find((e) => e.type === type);
  const next = existing
    ? inv.map((e) => (e.type === type ? { ...e, count: e.count + 1 } : e))
    : [...inv, { type, count: 1 }];
  return { ...profile, powers: next };
}

export async function listPowerForSale(
  type: PowerType,
  price: number
): Promise<{ ok: boolean; error?: string }> {
  const priceErr = validatePrice(price);
  if (priceErr) return { ok: false, error: priceErr };
  const sb = getSupabase();
  if (!sb) return { ok: false, error: "Cloud sync is off." };
  const uid = await authedUserId();
  if (!uid) return { ok: false, error: "Sign in to list items." };

  const before = loadProfile();
  const username = before.username || "captain";
  const removed = localRemovePower(before, type);
  if (!removed) return { ok: false, error: "You do not own that power." };
  saveProfile(removed);

  const { error } = await sb.from("market_listings").insert({
    seller_id: uid,
    seller_username: username,
    item_type: "power",
    item_data: { type },
    price: Math.floor(price),
  });

  if (error) {
    saveProfile(before);
    notify(error.message, "error");
    return { ok: false, error: error.message };
  }
  void syncCloudProfile(removed);
  notify(`Listed for ${Math.floor(price)} ⚓.`, "success");
  return { ok: true };
}

export async function listShipForSale(
  ship: CustomShip,
  price: number
): Promise<{ ok: boolean; error?: string }> {
  const priceErr = validatePrice(price);
  if (priceErr) return { ok: false, error: priceErr };
  const sb = getSupabase();
  if (!sb) return { ok: false, error: "Cloud sync is off." };
  const uid = await authedUserId();
  if (!uid) return { ok: false, error: "Sign in to list items." };

  const before = loadProfile();
  if (!before.customShip) return { ok: false, error: "No ship to list." };
  const username = before.username || "captain";
  const removed: LocalProfile = { ...before, customShip: null };
  saveProfile(removed);

  const { error } = await sb.from("market_listings").insert({
    seller_id: uid,
    seller_username: username,
    item_type: "ship",
    item_data: ship,
    price: Math.floor(price),
  });

  if (error) {
    saveProfile(before);
    notify(error.message, "error");
    return { ok: false, error: error.message };
  }
  void syncCloudProfile(removed);
  notify(`Ship listed for ${Math.floor(price)} ⚓.`, "success");
  return { ok: true };
}

export async function buyListing(
  listing: MarketListing
): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabase();
  if (!sb) return { ok: false, error: "Cloud sync is off." };
  const uid = await authedUserId();
  if (!uid) return { ok: false, error: "Sign in to buy." };

  if (listing.seller_id === uid) {
    return { ok: false, error: "You can't buy your own listing." };
  }

  // Cloud is the source of truth for coins. Local can lag (fresh device,
  // realtime not enabled, recent gain on another tab), so don't gate on
  // local — refresh from cloud first, then let the RPC make the final call.
  const fresh = await refreshProfileFromCloud();
  const before = fresh ?? loadProfile();
  const balance = before.coins ?? 0;

  const { data, error } = await sb.rpc("market_buy", {
    p_listing_id: listing.id,
    p_buyer_id: uid,
    p_buyer_username: before.username || "captain",
  });

  const result = (data ?? null) as { ok?: boolean; error?: string } | null;
  if (error || (result && result.ok === false)) {
    // If the server says insufficient, force-resync local to cloud so the
    // UI stops showing a stale balance.
    if (result?.error === "insufficient") {
      void refreshProfileFromCloud();
    }
    const reason =
      result?.error === "insufficient"
        ? "Insufficient coins."
        : result?.error === "self_buy"
          ? "You can't buy your own listing."
          : result?.error === "unavailable"
            ? "Already sold."
            : "Purchase failed. Try again.";
    notify(reason, "error");
    return { ok: false, error: reason };
  }

  // Apply the purchase locally so the UI reflects it before the next pull.
  let next: LocalProfile = { ...before, coins: balance - listing.price };
  if (listing.item_type === "power") {
    const powerType = (listing.item_data as PowerListingData).type;
    next = localAddPower(next, powerType);
  } else if (listing.item_type === "ship") {
    next = { ...next, customShip: listing.item_data as CustomShip };
  }
  saveProfile(next);
  void syncCloudProfile(next);
  notify("Purchase complete.", "success");
  return { ok: true };
}

export async function cancelListing(
  listing: MarketListing
): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabase();
  if (!sb) return { ok: false, error: "Cloud sync is off." };
  const uid = await authedUserId();
  if (!uid) return { ok: false, error: "Sign in to cancel listings." };

  const { data, error } = await sb.rpc("market_cancel", {
    p_listing_id: listing.id,
    p_user_id: uid,
  });

  const result = (data ?? null) as { ok?: boolean; error?: string } | null;
  if (error || (result && result.ok === false)) {
    const reason =
      result?.error === "not_owner"
        ? "You don't own this listing."
        : result?.error === "unavailable"
          ? "Already sold or cancelled."
          : error?.message ?? "Cancel failed.";
    notify(reason, "error");
    return { ok: false, error: reason };
  }

  // Mirror the returned item locally.
  const before = loadProfile();
  let next = before;
  if (listing.item_type === "power") {
    next = localAddPower(before, (listing.item_data as PowerListingData).type);
  } else if (listing.item_type === "ship") {
    next = { ...before, customShip: listing.item_data as CustomShip };
  }
  saveProfile(next);
  void syncCloudProfile(next);
  notify("Listing cancelled.", "success");
  return { ok: true };
}

export async function fetchActiveListings(
  limit = 100
): Promise<MarketListing[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data } = await sb
    .from("market_listings")
    .select("*")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data as MarketListing[] | null) ?? [];
}

export async function fetchMyListings(): Promise<MarketListing[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const uid = await authedUserId();
  if (!uid) return [];
  const { data } = await sb
    .from("market_listings")
    .select("*")
    .eq("seller_id", uid)
    .order("created_at", { ascending: false })
    .limit(100);
  return (data as MarketListing[] | null) ?? [];
}
