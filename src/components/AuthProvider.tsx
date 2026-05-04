"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { getSupabase, supabaseEnabled } from "@/lib/supabase/client";
import { LocalProfile, loadProfile, saveProfile } from "@/lib/storage";

type AuthResultCode = "email_not_confirmed";
type AuthResult = { ok: boolean; message: string; code?: AuthResultCode };

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

const USERNAME_DOMAIN = "battleship.neon";
const USERNAME_RE = /^[a-z0-9_-]{3,24}$/i;

function toAuthEmail(username: string) {
  return `${username.trim().toLowerCase()}@${USERNAME_DOMAIN}`;
}

function fromAuthEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const [local, domain] = email.split("@");
  if (!local) return null;
  if (domain && domain !== USERNAME_DOMAIN) return local;
  return local;
}

function validateUsername(username: string): string | null {
  if (!username) return "Callsign is required.";
  if (!USERNAME_RE.test(username)) {
    return "Callsign must be 3–24 chars: letters, numbers, dashes or underscores.";
  }
  return null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfileState] = useState<LocalProfile>({
    username: "Captain",
    city: "Unknown",
    pro: false,
    shipSkin: "default",
  });
  const [username, setUsername] = useState<string | null>(null);
  const cloudEnabled = supabaseEnabled();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProfileState(loadProfile());
  }, []);

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
    sb.auth.getUser().then(({ data }) => setUsername(fromAuthEmail(data.user?.email)));
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => {
      setUsername(fromAuthEmail(session?.user?.email));
    });
    return () => {
      sub.subscription.unsubscribe();
    };
  }, [cloudEnabled]);

  const setProfile = (p: LocalProfile) => {
    setProfileState(p);
    saveProfile(p);
  };

  async function upsertCloudProfile(name: string) {
    const sb = getSupabase();
    if (!sb) return;
    const { data: userData } = await sb.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) return;
    // Best-effort — skipped silently if the `profiles` table is missing or
    // RLS rejects. Local profile remains authoritative for UI.
    await sb
      .from("profiles")
      .upsert({ id: userId, username: name }, { onConflict: "id" });
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

    const { error } = await sb.auth.signInWithPassword({
      email: toAuthEmail(name),
      password,
    });
    if (error) {
      if (/email[_ ]not[_ ]confirmed|confirm/i.test(error.message)) {
        return {
          ok: false,
          code: "email_not_confirmed",
          message: "Account not yet activated. Please wait 1 minute and try again.",
        };
      }
      const msg = /invalid login credentials/i.test(error.message)
        ? "Wrong callsign or cipher key."
        : error.message;
      return { ok: false, message: msg };
    }

    setProfile({ ...profile, username: name, isGuest: false });
    setUsername(name);
    void upsertCloudProfile(name);
    return { ok: true, message: "Signed in." };
  };

  const signUpWithPassword = async (rawUsername: string, password: string): Promise<AuthResult> => {
    const name = rawUsername.trim();
    const validation = validateUsername(name);
    if (validation) return { ok: false, message: validation };

    if (!cloudEnabled) {
      const next = { ...profile, username: name, isGuest: false };
      setProfile(next);
      setUsername(name);
      return { ok: true, message: "Account created locally (cloud disabled)." };
    }
    const sb = getSupabase();
    if (!sb) return { ok: false, message: "Supabase client unavailable." };

    const email = toAuthEmail(name);
    const { data, error } = await sb.auth.signUp({ email, password });

    if (error) {
      const alreadyExists = /already (registered|exists)|user already/i.test(error.message ?? "");
      if (alreadyExists) {
        return { ok: false, message: "Callsign already taken — try signing in." };
      }
      return { ok: false, message: error.message };
    }

    // Email confirmation may still be on at the project level. Try the
    // synthetic-email signin immediately — if Supabase has auto-confirmed
    // (or confirmations are off), this hands us a session straight away.
    if (!data.session) {
      const { error: signInErr } = await sb.auth.signInWithPassword({ email, password });
      if (signInErr) {
        if (/email[_ ]not[_ ]confirmed|confirm/i.test(signInErr.message)) {
          return {
            ok: false,
            code: "email_not_confirmed",
            message: "Account created! Please wait 1 minute and try signing in.",
          };
        }
        return { ok: false, message: signInErr.message };
      }
    }

    setProfile({ ...profile, username: name, isGuest: false });
    setUsername(name);
    void upsertCloudProfile(name);
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

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
