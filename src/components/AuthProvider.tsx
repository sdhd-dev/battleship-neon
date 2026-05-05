"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { getSupabase, supabaseEnabled } from "@/lib/supabase/client";
import {
  LocalProfile,
  PROFILE_CHANGE_EVENT,
  clearLocalUserData,
  loadProfile,
  pullCloudProfile,
  saveProfile,
  syncCloudProfile,
} from "@/lib/storage";
import {
  claimPendingReferralRewards,
  processReferralOnSignup,
} from "@/lib/referrals";
import { CoinAnimation } from "./CoinAnimation";
import { LevelUpOverlay } from "./LevelUpOverlay";
import { NeonToast } from "./NeonToast";
import { getSkinGradient, getThemeVars } from "@/lib/shop-catalog";

type AuthResult = { ok: boolean; message: string };

interface AuthContextValue {
  profile: LocalProfile;
  setProfile: (p: LocalProfile) => void;
  username: string | null;
  isGuest: boolean;
  cloudEnabled: boolean;
  signInWithPassword: (username: string, password: string) => Promise<AuthResult>;
  signUpWithPassword: (username: string, password: string) => Promise<AuthResult>;
  continueAsGuest: (callsign?: string) => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const USERNAME_RE = /^[a-z0-9_]{3,20}$/i;

function validateUsername(username: string): string | null {
  if (!username) return "Callsign is required.";
  if (!USERNAME_RE.test(username)) {
    return "Username must be 3–20 letters, numbers or _";
  }
  return null;
}

async function lookupAuthEmail(
  sb: ReturnType<typeof getSupabase>,
  usernameLc: string,
): Promise<string | null> {
  if (!sb) return null;
  const { data } = await sb
    .from("profiles")
    .select("auth_email")
    .eq("username_lc", usernameLc)
    .maybeSingle();
  return data?.auth_email ?? null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfileState] = useState<LocalProfile>(() => loadProfile());
  const [username, setUsername] = useState<string | null>(null);
  const cloudEnabled = supabaseEnabled();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProfileState(loadProfile());
  }, []);

  // Listen for profile changes pushed by economy/referral flows so the UI
  // stays in sync without manual prop drilling.
  useEffect(() => {
    const handler = () => setProfileState(loadProfile());
    window.addEventListener(PROFILE_CHANGE_EVENT, handler);
    return () => window.removeEventListener(PROFILE_CHANGE_EVENT, handler);
  }, []);

  // Apply the active board theme by mutating CSS vars on :root. Cleared
  // (not just reverted) when switching back to default so the base theme
  // stylesheet wins again.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const vars = getThemeVars(profile.activeBoardTheme);
    const root = document.documentElement;
    const keys = ["--accent", "--accent-2", "--accent-3"];
    for (const k of keys) {
      const v = vars[k];
      if (v) root.style.setProperty(k, v);
      else root.style.removeProperty(k);
    }
  }, [profile.activeBoardTheme]);

  // Apply the active ship skin gradient as a CSS variable consumed by
  // `.cell.ship` in globals.css. Cleared on default so the theme-driven
  // fallback gradient takes over.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const gradient = getSkinGradient(profile.shipSkin);
    const root = document.documentElement;
    if (gradient) root.style.setProperty("--ship-skin-gradient", gradient);
    else root.style.removeProperty("--ship-skin-gradient");
  }, [profile.shipSkin]);

  // Supabase's implicit flow can land users on any page with
  // `#error_code=otp_expired&...` — fragments are client-only, so the
  // next.config redirect can't catch them. Scrub here and bounce to /auth.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    if (!hash) return;
    if (/error_code=otp_expired|error=access_denied/i.test(hash)) {
      window.location.replace("/auth?recovered=1");
    }
  }, []);

  useEffect(() => {
    if (!cloudEnabled) return;
    const sb = getSupabase();
    if (!sb) return;
    // The synthetic email no longer encodes the username — look the row up
    // by user id and read the canonical username from `profiles`.
    const resolveByUserId = async (userId: string | null | undefined) => {
      if (!userId) {
        setUsername(null);
        return;
      }
      const { data } = await sb
        .from("profiles")
        .select("username")
        .eq("id", userId)
        .maybeSingle();
      const name = data?.username ?? null;
      setUsername(name);
      if (name) void hydrateFromCloud(name);
    };
    sb.auth.getUser().then(({ data }) => resolveByUserId(data.user?.id));
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => {
      void resolveByUserId(session?.user?.id);
    });
    return () => {
      sub.subscription.unsubscribe();
    };
  }, [cloudEnabled]);

  const setProfile = (p: LocalProfile) => {
    setProfileState(p);
    saveProfile(p);
    void syncCloudProfile(p);
  };

  // Pull cloud profile snapshot and merge it over local state. Cloud is
  // authoritative for economy fields when signed in — prevents a fresh
  // device from zeroing out coins/xp.
  async function hydrateFromCloud(name: string) {
    const remote = await pullCloudProfile();
    if (!remote) return;
    const local = loadProfile();
    // Cloud wins for economy & cosmetic ownership; local wins for username
    // (the user might be mid-edit).
    const merged: LocalProfile = {
      ...local,
      ...remote,
      username: local.username || remote.username || name,
      isGuest: false,
    };
    saveProfile(merged);
    void claimPendingReferralRewards(name);
  }

  async function upsertCloudProfile(
    name: string,
    extras?: { auth_email?: string }
  ) {
    const sb = getSupabase();
    if (!sb) return;
    const { data: userData } = await sb.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) return;
    await sb.from("profiles").upsert(
      {
        id: userId,
        username: name,
        username_lc: name.toLowerCase(),
        ...(extras?.auth_email ? { auth_email: extras.auth_email } : {}),
      },
      { onConflict: "id" }
    );
  }

  const signInWithPassword = async (rawUsername: string, password: string): Promise<AuthResult> => {
    const name = rawUsername.trim();
    const validation = validateUsername(name);
    if (validation) return { ok: false, message: validation };

    if (!cloudEnabled) {
      const next = { ...profile, username: name, isGuest: false };
      setProfile(next);
      setUsername(name);
      return { ok: true, message: "Signed in locally (cloud disabled — set Supabase env vars to enable)." };
    }
    const sb = getSupabase();
    if (!sb) return { ok: false, message: "Supabase client unavailable." };

    const email = await lookupAuthEmail(sb, name.toLowerCase());
    if (!email) {
      return { ok: false, message: "Wrong callsign or cipher key." };
    }

    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) {
      const msg = /invalid login credentials/i.test(error.message)
        ? "Wrong callsign or cipher key."
        : error.message;
      return { ok: false, message: msg };
    }

    // Drop any cached profile/stats from a previous account on this device,
    // then seed a minimal local profile. We deliberately use saveProfile
    // (local-only) instead of setProfile so we don't push stale economy
    // fields to the new user's cloud row — hydrateFromCloud will overwrite
    // local with the authoritative server snapshot.
    clearLocalUserData();
    const fresh: LocalProfile = { ...loadProfile(), username: name, isGuest: false };
    setProfileState(fresh);
    saveProfile(fresh);
    setUsername(name);
    void upsertCloudProfile(name);
    void hydrateFromCloud(name);
    return { ok: true, message: "Signed in." };
  };

  const signUpWithPassword = async (rawUsername: string, password: string): Promise<AuthResult> => {
    const name = rawUsername.trim();
    const validation = validateUsername(name);
    if (validation) return { ok: false, message: validation };
    if (password.length < 6) {
      return { ok: false, message: "Cipher key must be at least 6 characters." };
    }

    if (!cloudEnabled) {
      const next = { ...profile, username: name, isGuest: false };
      setProfile(next);
      setUsername(name);
      void processReferralOnSignup(name);
      return { ok: true, message: "Account created locally (cloud disabled)." };
    }
    const sb = getSupabase();
    if (!sb) return { ok: false, message: "Supabase client unavailable." };

    // Account creation runs server-side via /api/auth/signup so we can use
    // the service-role admin API to skip email confirmation. The key never
    // ships to the browser.
    let res: Response;
    try {
      res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ username: name, password }),
      });
    } catch {
      return { ok: false, message: "Network error. Try again." };
    }

    let body: { userId?: string; email?: string; error?: string } = {};
    try {
      body = await res.json();
    } catch {
      return { ok: false, message: "Sign up failed." };
    }
    if (!res.ok || !body.email) {
      return { ok: false, message: body.error || "Sign up failed." };
    }

    const { error: signInErr } = await sb.auth.signInWithPassword({
      email: body.email,
      password,
    });
    if (signInErr) {
      return { ok: false, message: signInErr.message };
    }

    // Brand-new account: drop any cached profile from a previous signed-in
    // user on this device so the new user starts at default coins/xp/etc.
    // and we don't accidentally push the previous user's data to the new
    // cloud row via syncCloudProfile.
    clearLocalUserData();
    const fresh: LocalProfile = { ...loadProfile(), username: name, isGuest: false };
    setProfile(fresh);
    setUsername(name);
    void processReferralOnSignup(name);
    return { ok: true, message: "Account created." };
  };

  const continueAsGuest = (callsign?: string) => {
    const trimmed = callsign?.trim();
    const guestName =
      trimmed && USERNAME_RE.test(trimmed)
        ? trimmed
        : profile.username && profile.username !== "Captain"
          ? profile.username
          : "Captain";
    const next = { ...profile, username: guestName, isGuest: true };
    setProfile(next);
    setUsername(null);
  };

  const signOut = async () => {
    if (cloudEnabled) {
      const sb = getSupabase();
      if (sb) await sb.auth.signOut();
    }
    clearLocalUserData();
    setProfileState(loadProfile());
    setUsername(null);
  };

  const isGuest = !username;

  const value = useMemo<AuthContextValue>(
    () => ({
      profile,
      setProfile,
      username,
      isGuest,
      cloudEnabled,
      signInWithPassword,
      signUpWithPassword,
      continueAsGuest,
      signOut,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [profile, username, isGuest, cloudEnabled]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
      <CoinAnimation />
      <LevelUpOverlay />
      <NeonToast />
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
