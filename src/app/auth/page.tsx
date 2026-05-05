"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "@/components/AuthProvider";

type Mode = "signin" | "signup";

interface Particle {
  id: number;
  x: number;
  y: number;
  size: number;
  delay: number;
  duration: number;
  hue: 0 | 1 | 2;
}

export default function AuthPage() {
  return (
    <Suspense fallback={<AuthPageShell />}>
      <AuthPageInner />
    </Suspense>
  );
}

function AuthPageShell() {
  return <div className="bg-field min-h-screen" />;
}

function AuthPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { signInWithPassword, signUpWithPassword, continueAsGuest, cloudEnabled } = useAuth();

  const initialMode: Mode = searchParams.get("tab") === "signup" ? "signup" : "signin";
  const [mode, setMode] = useState<Mode>(initialMode);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [particles, setParticles] = useState<Particle[]>([]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setParticles(
      Array.from({ length: 28 }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: 1 + Math.random() * 2.5,
        delay: Math.random() * 6,
        duration: 6 + Math.random() * 8,
        hue: (i % 3) as 0 | 1 | 2,
      }))
    );
  }, []);

  // Legacy OTP-error fragments may still land here from old confirmation
  // links — scrub them and show a neutral notice.
  useEffect(() => {
    const recovered = searchParams.get("recovered");
    const tab = searchParams.get("tab");
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    const hashHasOtpError = /error_code=otp_expired|error=access_denied/i.test(hash);

    if (recovered || hashHasOtpError) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNotice("Sign in with your callsign and cipher key — no email needed.");
      if (typeof window !== "undefined") {
        const next = tab === "signup" ? "/auth?tab=signup" : "/auth";
        window.history.replaceState(null, "", next);
      }
    }
  }, [searchParams]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError(null);

    if (!username || !password) {
      setError("Callsign and cipher key are required.");
      return;
    }
    if (!/^[A-Za-z0-9_]{3,20}$/.test(username.trim())) {
      setError("Callsign must be 3–20 letters, numbers or _");
      return;
    }
    if (mode === "signup" && password.length < 6) {
      setError("Cipher key must be at least 6 characters.");
      return;
    }

    setLoading(true);
    try {
      const fn = mode === "signin" ? signInWithPassword : signUpWithPassword;
      const res = await fn(username.trim(), password);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed.");
    } finally {
      setLoading(false);
    }
  }

  function handleGuest() {
    continueAsGuest(username.trim() || undefined);
    router.push("/");
  }

  return (
    <div className="bg-field min-h-screen relative overflow-hidden">
      {/* Drifting particles */}
      <div className="pointer-events-none absolute inset-0 z-0">
        {particles.map((p) => (
          <motion.span
            key={p.id}
            className="absolute rounded-full"
            style={{
              left: `${p.x}%`,
              top: `${p.y}%`,
              width: p.size,
              height: p.size,
              background:
                p.hue === 0
                  ? "var(--accent)"
                  : p.hue === 1
                  ? "var(--accent-2)"
                  : "var(--accent-3)",
              boxShadow: `0 0 ${4 + p.size * 3}px currentColor`,
              color:
                p.hue === 0
                  ? "var(--accent)"
                  : p.hue === 1
                  ? "var(--accent-2)"
                  : "var(--accent-3)",
            }}
            animate={{
              y: [0, -40, 0],
              opacity: [0.15, 0.85, 0.15],
            }}
            transition={{
              duration: p.duration,
              delay: p.delay,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        ))}
      </div>

      <main className="relative z-10 min-h-screen grid place-items-center p-4 sm:p-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          className="w-full max-w-md"
        >
          {/* Header */}
          <div className="flex flex-col items-center text-center mb-6">
            <div className="relative mb-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-accent via-accent-3 to-accent-2 shadow-[0_0_28px_rgba(0,240,255,0.55)]" />
              <motion.div
                className="absolute inset-0 rounded-2xl border border-accent/60"
                animate={{ scale: [1, 1.25, 1], opacity: [0.65, 0, 0.65] }}
                transition={{ duration: 2.4, repeat: Infinity }}
              />
              <motion.div
                className="absolute -inset-2 rounded-3xl border border-accent-2/40"
                animate={{ scale: [1, 1.15, 1], opacity: [0.4, 0, 0.4] }}
                transition={{ duration: 3.1, repeat: Infinity, delay: 0.6 }}
              />
            </div>
            <div className="text-[10px] uppercase tracking-[0.5em] text-fg-dim">
              Naval Combat OS
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold title-grad neon-text mt-1">
              BATTLESHIP.NEON
            </h1>
            <div className="mt-2 text-xs text-fg-dim">
              <span className="inline-flex items-center gap-2">
                <motion.span
                  className="inline-block w-1.5 h-1.5 rounded-full bg-accent"
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 1.6, repeat: Infinity }}
                />
                Secure terminal · awaiting credentials
              </span>
            </div>
          </div>

          {/* Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, delay: 0.1, ease: "easeOut" }}
            className="glass neon-border scan rounded-3xl p-6 sm:p-8 relative"
          >
            <AnimatePresence>
              {notice && (
                <motion.div
                  key="notice"
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className="mb-4 rounded-xl border border-accent-3/40 bg-accent-3/10 px-3 py-2.5 text-xs leading-relaxed text-fg-dim"
                  role="status"
                >
                  <span className="mr-2 text-accent-3">↺</span>
                  {notice}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Tabs */}
            <div className="relative grid grid-cols-2 mb-6 rounded-xl border border-white/10 bg-black/30 p-1">
              <motion.div
                layout
                className="absolute top-1 bottom-1 left-1 w-[calc(50%-0.25rem)] rounded-lg"
                style={{
                  background:
                    "linear-gradient(135deg, color-mix(in oklab, var(--accent) 35%, transparent), color-mix(in oklab, var(--accent-2) 35%, transparent))",
                  boxShadow:
                    "0 0 0 1px color-mix(in oklab, var(--accent) 55%, transparent), 0 0 18px color-mix(in oklab, var(--accent-2) 35%, transparent)",
                }}
                animate={{ x: mode === "signin" ? 0 : "100%" }}
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
              />
              {(["signin", "signup"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setMode(m);
                    setError(null);
                  }}
                  className={`relative z-10 py-2.5 text-sm font-semibold tracking-wide uppercase transition-colors ${
                    mode === m ? "text-fg" : "text-fg-dim hover:text-fg"
                  }`}
                >
                  {m === "signin" ? "Sign In" : "Sign Up"}
                </button>
              ))}
            </div>

            <AnimatePresence mode="wait">
              <motion.form
                key={mode}
                onSubmit={handleSubmit}
                initial={{ opacity: 0, x: mode === "signin" ? -16 : 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: mode === "signin" ? 16 : -16 }}
                transition={{ duration: 0.22, ease: "easeOut" }}
                className="flex flex-col gap-4"
              >
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase tracking-[0.3em] text-fg-dim block">
                    Operator Callsign
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-accent/80 text-sm">
                      ◈
                    </span>
                    <input
                      type="text"
                      autoComplete="username"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      required
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="captain_nova"
                      className="neon-input"
                      disabled={loading}
                      pattern="[A-Za-z0-9_]{3,20}"
                      minLength={3}
                      maxLength={20}
                    />
                  </div>
                  <p className="text-[10px] text-fg-dim/80 pl-1">
                    Only letters, numbers and _ allowed
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase tracking-[0.3em] text-fg-dim block">
                    Cipher Key
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-accent-2/80 text-sm">
                      ⚿
                    </span>
                    <input
                      type="password"
                      autoComplete={mode === "signin" ? "current-password" : "new-password"}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={mode === "signin" ? "••••••••" : "min. 6 characters"}
                      className="neon-input"
                      disabled={loading}
                      minLength={mode === "signup" ? 6 : undefined}
                    />
                  </div>
                </div>

                <AnimatePresence>
                  {error && (
                    <motion.div
                      key="error"
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      className="neon-error rounded-xl px-3 py-2.5 text-sm font-medium"
                      role="alert"
                    >
                      <span className="mr-2">⚠</span>
                      {error}
                    </motion.div>
                  )}
                </AnimatePresence>

                <button
                  type="submit"
                  disabled={loading}
                  className="neon-btn rounded-xl px-4 py-3 font-semibold tracking-wide flex items-center justify-center gap-3 disabled:opacity-70 disabled:cursor-not-allowed mt-1"
                >
                  {loading ? (
                    <>
                      <span className="neon-spinner" />
                      <span className="text-sm uppercase tracking-[0.25em]">
                        {mode === "signin" ? "Authenticating" : "Provisioning"}
                      </span>
                    </>
                  ) : (
                    <span className="text-sm uppercase tracking-[0.25em]">
                      {mode === "signin" ? "→ Engage" : "✦ Enlist"}
                    </span>
                  )}
                </button>
              </motion.form>
            </AnimatePresence>

            <div className="my-5 flex items-center gap-3 text-[10px] uppercase tracking-[0.3em] text-fg-dim">
              <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/15 to-white/15" />
              or
              <div className="flex-1 h-px bg-gradient-to-r from-white/15 via-white/15 to-transparent" />
            </div>

            <button
              type="button"
              onClick={handleGuest}
              disabled={loading}
              className="w-full rounded-xl px-4 py-3 border border-white/15 hover:border-accent-3/60 hover:bg-white/5 text-sm font-semibold tracking-wide uppercase transition-colors disabled:opacity-50"
            >
              ◐ Continue as Guest
            </button>
            <p className="mt-2 text-[11px] text-fg-dim text-center leading-relaxed">
              Full game access · stats saved locally · global leaderboard sync disabled
            </p>

            {!cloudEnabled && (
              <p className="mt-4 text-[11px] text-fg-dim text-center leading-relaxed">
                Cloud sync is offline — credentials are stored locally only.<br />
                Set <code className="text-accent">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
                <code className="text-accent">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to enable real auth.
              </p>
            )}
            {cloudEnabled && (
              <p className="mt-4 text-[11px] text-fg-dim text-center leading-relaxed">
                Callsign-only auth — no email confirmations, no magic links.
              </p>
            )}
          </motion.div>

          <div className="mt-6 text-center">
            <Link
              href="/"
              className="text-xs text-fg-dim hover:text-fg uppercase tracking-[0.3em] transition-colors"
            >
              ← Return to bridge
            </Link>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
