"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useTheme } from "./ThemeProvider";
import { useAuth } from "./AuthProvider";

interface TopBarProps {
  onUpgrade: () => void;
}

export function TopBar({ onUpgrade }: TopBarProps) {
  const router = useRouter();
  const { theme, toggle } = useTheme();
  const { profile, setProfile, username, signOut, cloudEnabled, isGuest } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const authRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!authOpen) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      if (authRef.current && !authRef.current.contains(e.target as Node)) {
        setAuthOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAuthOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [authOpen]);

  const signedIn = Boolean(username);

  return (
    <header className="relative z-50 flex items-center justify-between p-4 sm:p-6 gap-3">
      <div className="flex items-center gap-3">
        <div className="relative">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent via-accent-3 to-accent-2 shadow-[0_0_18px_rgba(0,240,255,0.5)]" />
          <motion.div
            className="absolute inset-0 rounded-xl border border-accent/60"
            animate={{ scale: [1, 1.15, 1], opacity: [0.6, 0, 0.6] }}
            transition={{ duration: 2.4, repeat: Infinity }}
          />
        </div>
        <div className="leading-tight">
          <div className="text-[10px] uppercase tracking-[0.4em] text-fg-dim">Naval Combat OS</div>
          <h1 className="text-xl sm:text-2xl font-extrabold title-grad">BATTLESHIP.NEON</h1>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={onUpgrade}
          className="hidden sm:inline-flex neon-btn rounded-xl px-3 py-2 text-sm font-semibold"
        >
          {profile.pro ? "✦ Pro" : "Upgrade to Pro"}
        </button>
        <button
          onClick={toggle}
          className="rounded-xl px-3 py-2 border border-white/15 hover:bg-white/5 text-sm"
          aria-label="Toggle theme"
        >
          {theme === "dark" ? "☾" : "☀"}
        </button>
        <div className="relative" ref={authRef}>
          <button
            onClick={() => setAuthOpen((o) => !o)}
            className="rounded-xl px-3 py-2 border border-white/15 hover:bg-white/5 text-sm flex items-center gap-2"
          >
            <span className="w-6 h-6 rounded-full bg-gradient-to-br from-accent-3 to-accent-2 grid place-items-center text-xs font-bold">
              {(profile.username[0] ?? "C").toUpperCase()}
            </span>
            <span className="hidden sm:inline">{signedIn ? profile.username : "Sign in"}</span>
          </button>
          {authOpen && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className="absolute right-0 mt-2 w-72 glass rounded-2xl p-4 z-50"
            >
              {!editingProfile ? (
                <>
                  <div className="text-xs uppercase tracking-[0.3em] text-fg-dim">
                    {signedIn
                      ? "Signed in"
                      : isGuest && profile.isGuest
                        ? "Guest"
                        : cloudEnabled
                          ? "Not signed in"
                          : "Local profile"}
                  </div>
                  <div className="font-semibold mt-1">{profile.username}</div>
                  <div className="text-xs text-fg-dim">{profile.city || "Unknown"}</div>
                  {signedIn && username && (
                    <div className="text-xs text-fg-dim mt-1">@{username}</div>
                  )}
                  {!signedIn && profile.isGuest && cloudEnabled && (
                    <div className="text-[11px] text-fg-dim mt-2 leading-relaxed">
                      Stats saved on this device. Sign in to sync with the global leaderboard.
                    </div>
                  )}

                  {!signedIn && cloudEnabled && (
                    <button
                      onClick={() => {
                        setAuthOpen(false);
                        router.push("/auth");
                      }}
                      className="mt-3 w-full neon-btn rounded-lg px-3 py-2 text-sm font-semibold"
                    >
                      {profile.isGuest ? "Sign in to sync" : "Sign in with callsign"}
                    </button>
                  )}

                  {!cloudEnabled && (
                    <p className="text-[11px] text-fg-dim mt-2">
                      Cloud sync is off. Add <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to enable global leaderboard.
                    </p>
                  )}

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setEditingProfile(true)}
                      className="rounded-lg border border-white/15 hover:bg-white/5 px-3 py-2 text-sm"
                    >
                      Edit profile
                    </button>
                    {signedIn && (
                      <button
                        onClick={async () => {
                          await signOut();
                        }}
                        className="rounded-lg border border-white/15 hover:bg-white/5 px-3 py-2 text-sm"
                      >
                        Sign out
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex flex-col gap-2">
                  <label className="text-xs uppercase tracking-[0.2em] text-fg-dim">Captain name</label>
                  <input
                    value={profile.username}
                    onChange={(e) => setProfile({ ...profile, username: e.target.value })}
                    className="rounded-lg bg-black/30 border border-white/15 px-3 py-2 text-sm"
                  />
                  <label className="text-xs uppercase tracking-[0.2em] text-fg-dim">City</label>
                  <input
                    value={profile.city}
                    onChange={(e) => setProfile({ ...profile, city: e.target.value })}
                    className="rounded-lg bg-black/30 border border-white/15 px-3 py-2 text-sm"
                  />
                  <button
                    onClick={() => setEditingProfile(false)}
                    className="neon-btn rounded-lg px-3 py-2 text-sm font-semibold mt-1"
                  >
                    Save
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </div>
      </div>
    </header>
  );
}
