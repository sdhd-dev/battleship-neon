"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import clsx from "clsx";
import { useAuth } from "./AuthProvider";
import { buildInviteUrl, fetchReferralStats } from "@/lib/referrals";
import {
  DEFAULT_POST_TEXT,
  PLATFORMS,
  POSTED_PLATFORM_REWARD,
  SHARE_LINK_REWARD,
  SocialPlatform,
  ViralClaim,
  claimPlatformPostReward,
  claimShareLinkReward,
  fetchMyViralClaims,
  hasClaimedShareLinkReward,
  platformClaimedToday,
  submitViralClaim,
} from "@/lib/social";

type ClaimSubmitState = "idle" | "submitting" | "ok" | "error";

export function SocialPanel() {
  const { profile, username, cloudEnabled } = useAuth();
  const inviteUrl = buildInviteUrl(profile.username || username || "captain");

  const [linkCopied, setLinkCopied] = useState(false);
  const [linkClaimed, setLinkClaimed] = useState(false);
  const [referralStats, setReferralStats] = useState({ count: 0, coinsEarned: 0 });

  const [postText, setPostText] = useState(DEFAULT_POST_TEXT);
  const [platformClaims, setPlatformClaims] = useState<Record<SocialPlatform, boolean>>({
    twitter: false,
    instagram: false,
    tiktok: false,
  });
  const [copiedPlatform, setCopiedPlatform] = useState<SocialPlatform | null>(null);

  const [claimsOpen, setClaimsOpen] = useState(false);
  const [submitState, setSubmitState] = useState<ClaimSubmitState>("idle");
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const [myClaims, setMyClaims] = useState<ViralClaim[]>([]);
  const [claimsLoaded, setClaimsLoaded] = useState(false);

  // Form state
  const [claimPlatform, setClaimPlatform] = useState<SocialPlatform>("twitter");
  const [claimPostUrl, setClaimPostUrl] = useState("");
  const [claimPayoutMethod, setClaimPayoutMethod] = useState("Kaspi");
  const [claimPayoutHandle, setClaimPayoutHandle] = useState("");
  const [claimNote, setClaimNote] = useState("");
  const [claimFile, setClaimFile] = useState<File | null>(null);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setLinkClaimed(hasClaimedShareLinkReward());
    setPlatformClaims({
      twitter: platformClaimedToday("twitter"),
      instagram: platformClaimedToday("instagram"),
      tiktok: platformClaimedToday("tiktok"),
    });
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [profile.coins]);

  useEffect(() => {
    if (!username) return;
    fetchReferralStats(username).then(setReferralStats).catch(() => {});
  }, [username]);

  useEffect(() => {
    if (!claimsOpen || !username) return;
    fetchMyViralClaims(username).then((c) => {
      setMyClaims(c);
      setClaimsLoaded(true);
    });
  }, [claimsOpen, username]);

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 1600);
      if (!linkClaimed) {
        const r = claimShareLinkReward();
        if (r.awarded) setLinkClaimed(true);
      }
    } catch {
      // clipboard unavailable
    }
  };

  const openShare = async (platform: SocialPlatform) => {
    const def = PLATFORMS.find((p) => p.id === platform)!;
    const url = def.shareUrl(`${postText} ${inviteUrl}`, inviteUrl);
    // For Instagram/TikTok we copy the caption (no web intent).
    if (platform === "instagram" || platform === "tiktok") {
      try {
        await navigator.clipboard.writeText(`${postText} ${inviteUrl}`);
        setCopiedPlatform(platform);
        window.setTimeout(() => setCopiedPlatform(null), 1800);
      } catch {
        // clipboard blocked — keep going so the user can still navigate
      }
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const claimPosted = (platform: SocialPlatform) => {
    if (platformClaims[platform]) return;
    const r = claimPlatformPostReward(platform);
    if (r.awarded) {
      setPlatformClaims((prev) => ({ ...prev, [platform]: true }));
    }
  };

  const submitClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username) {
      setSubmitState("error");
      setSubmitMessage("Sign in with a callsign before submitting a claim.");
      return;
    }
    if (!claimFile) {
      setSubmitState("error");
      setSubmitMessage("Attach a screenshot of the post.");
      return;
    }
    if (!claimPostUrl.trim()) {
      setSubmitState("error");
      setSubmitMessage("Paste the public link to the post.");
      return;
    }
    if (!claimPayoutHandle.trim()) {
      setSubmitState("error");
      setSubmitMessage("Provide a payout handle so we can send the reward.");
      return;
    }
    setSubmitState("submitting");
    setSubmitMessage(null);
    const res = await submitViralClaim({
      username,
      platform: claimPlatform,
      postUrl: claimPostUrl,
      screenshotFile: claimFile,
      payoutMethod: claimPayoutMethod,
      payoutHandle: claimPayoutHandle,
      note: claimNote,
    });
    if (!res.ok) {
      setSubmitState("error");
      setSubmitMessage(res.error || "Could not submit. Try again.");
      return;
    }
    setSubmitState("ok");
    setSubmitMessage("Claim submitted! We'll review within a few days.");
    setClaimPostUrl("");
    setClaimPayoutHandle("");
    setClaimNote("");
    setClaimFile(null);
    if (res.claim) setMyClaims((prev) => [res.claim!, ...prev]);
  };

  return (
    <div className="glass rounded-3xl p-5 sm:p-6 grid gap-5">
      <header>
        <div className="text-xs uppercase tracking-[0.3em] text-fg-dim">Grow the fleet</div>
        <h3 className="text-xl font-bold neon-text">Share &amp; Earn</h3>
        <p className="text-xs text-fg-dim mt-1">
          Invite friends, post about us, go viral — every step pays in ⚓ coins (and possibly real cash).
        </p>
      </header>

      {/* ── Invite link ──────────────────────────────────────────── */}
      <section className="rounded-2xl border border-white/10 bg-black/30 p-4 grid gap-3">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <div>
            <div className="text-[10px] uppercase tracking-[0.3em] text-fg-dim">
              1 · Personal invite link
            </div>
            <div className="text-sm font-semibold mt-0.5">
              Share for{" "}
              <span style={{ color: "#fbbf24" }}>+{SHARE_LINK_REWARD} ⚓</span>{" "}
              now · friend signs up = both get +50 ⚓
            </div>
          </div>
          {linkClaimed && (
            <span className="text-[10px] uppercase tracking-[0.3em] text-accent">
              ✓ +{SHARE_LINK_REWARD} claimed
            </span>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          <input
            readOnly
            value={inviteUrl}
            onClick={(e) => (e.target as HTMLInputElement).select()}
            className="flex-1 min-w-[200px] rounded-md bg-black/40 border border-white/10 px-2 py-2 text-[12px] font-mono"
          />
          <button
            onClick={copyInvite}
            className="neon-btn rounded-md px-3 py-2 text-xs font-semibold whitespace-nowrap"
          >
            {linkCopied ? "Copied!" : linkClaimed ? "Copy link" : `Copy · +${SHARE_LINK_REWARD} ⚓`}
          </button>
        </div>
        {username && (
          <div className="text-[11px] text-fg-dim">
            {referralStats.count} friend{referralStats.count === 1 ? "" : "s"} invited · +
            {referralStats.coinsEarned} ⚓ earned from referrals
          </div>
        )}
      </section>

      {/* ── Post about us ────────────────────────────────────────── */}
      <section className="rounded-2xl border border-white/10 bg-black/30 p-4 grid gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.3em] text-fg-dim">
            2 · Post about us (honor system)
          </div>
          <div className="text-sm font-semibold mt-0.5">
            +{POSTED_PLATFORM_REWARD} ⚓ per platform · once per day each
          </div>
        </div>
        <textarea
          value={postText}
          onChange={(e) => setPostText(e.target.value)}
          rows={2}
          maxLength={240}
          className="w-full rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-xs leading-snug resize-none focus:outline-none focus:border-accent/60"
          placeholder="Write your post copy…"
        />
        <div className="grid grid-cols-1 gap-2.5">
          {PLATFORMS.map((p) => {
            const claimed = platformClaims[p.id];
            const justCopied = copiedPlatform === p.id;
            return (
              <div
                key={p.id}
                className="rounded-xl border border-white/10 bg-black/40 p-3.5 grid gap-2.5"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-lg leading-none shrink-0" aria-hidden>
                      {p.emoji}
                    </span>
                    <span className="text-sm font-semibold truncate">
                      {p.label}
                    </span>
                  </div>
                  {claimed && (
                    <span className="shrink-0 text-[9px] uppercase tracking-[0.2em] text-accent whitespace-nowrap">
                      ✓ today
                    </span>
                  )}
                </div>
                <button
                  onClick={() => openShare(p.id)}
                  className="w-full rounded-lg border border-white/15 hover:bg-white/5 hover:border-white/25 px-3 py-2 text-xs font-semibold transition-colors"
                >
                  {justCopied ? "Caption copied!" : `Open ${p.label}`}
                </button>
                <button
                  onClick={() => claimPosted(p.id)}
                  disabled={claimed}
                  className={clsx(
                    "w-full rounded-lg px-3 py-2 text-xs font-semibold",
                    claimed
                      ? "border border-white/10 text-fg-dim cursor-not-allowed"
                      : "neon-btn"
                  )}
                >
                  {claimed
                    ? `+${POSTED_PLATFORM_REWARD} ⚓ claimed`
                    : `I posted! +${POSTED_PLATFORM_REWARD} ⚓`}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Viral claim ─────────────────────────────────────────── */}
      <section className="rounded-2xl border border-amber-300/40 bg-amber-300/[0.05] p-4 grid gap-3">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <div>
            <div className="text-[10px] uppercase tracking-[0.3em] text-fg-dim">
              3 · Viral reward · real money
            </div>
            <div className="text-sm font-semibold mt-0.5" style={{ color: "#fbbf24" }}>
              🔥 Got 1,000+ likes? Submit proof to claim a creator payout.
            </div>
            <p className="text-[11px] text-fg-dim mt-1 leading-relaxed">
              Approved claims are paid manually via Kaspi or PayPal. Approved creators
              get a 🔥 Viral Creator badge on the leaderboard.
            </p>
          </div>
          <button
            onClick={() => setClaimsOpen((o) => !o)}
            className="rounded-lg border border-amber-300/50 hover:bg-amber-300/10 px-3 py-2 text-xs font-semibold whitespace-nowrap"
            style={{ color: "#fbbf24" }}
          >
            {claimsOpen ? "Hide form" : "Submit a claim"}
          </button>
        </div>

        <AnimatePresence>
          {claimsOpen && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="grid gap-3"
            >
              {!cloudEnabled && (
                <div className="text-[11px] text-fg-dim">
                  Cloud sync is off — viral claims need Supabase.
                </div>
              )}
              {!username && cloudEnabled && (
                <div className="text-[11px] text-fg-dim">
                  Sign in with a callsign so we can attach the claim to your account.
                </div>
              )}

              <form onSubmit={submitClaim} className="grid gap-3">
                <div className="grid sm:grid-cols-2 gap-3">
                  <label className="grid gap-1">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-fg-dim">
                      Platform
                    </span>
                    <select
                      value={claimPlatform}
                      onChange={(e) => setClaimPlatform(e.target.value as SocialPlatform)}
                      className="rounded-lg bg-black/40 border border-white/15 px-3 py-2 text-sm"
                    >
                      {PLATFORMS.map((p) => (
                        <option key={p.id} value={p.id} className="bg-bg">
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-fg-dim">
                      Post URL
                    </span>
                    <input
                      type="url"
                      required
                      value={claimPostUrl}
                      onChange={(e) => setClaimPostUrl(e.target.value)}
                      placeholder="https://x.com/you/status/123…"
                      className="rounded-lg bg-black/40 border border-white/15 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="grid gap-1">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-fg-dim">
                      Payout method
                    </span>
                    <select
                      value={claimPayoutMethod}
                      onChange={(e) => setClaimPayoutMethod(e.target.value)}
                      className="rounded-lg bg-black/40 border border-white/15 px-3 py-2 text-sm"
                    >
                      <option className="bg-bg">Kaspi</option>
                      <option className="bg-bg">PayPal</option>
                      <option className="bg-bg">Other</option>
                    </select>
                  </label>
                  <label className="grid gap-1">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-fg-dim">
                      Payout handle
                    </span>
                    <input
                      type="text"
                      required
                      value={claimPayoutHandle}
                      onChange={(e) => setClaimPayoutHandle(e.target.value)}
                      placeholder="+7… or you@email"
                      className="rounded-lg bg-black/40 border border-white/15 px-3 py-2 text-sm"
                    />
                  </label>
                </div>
                <label className="grid gap-1">
                  <span className="text-[10px] uppercase tracking-[0.2em] text-fg-dim">
                    Screenshot · likes visible
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    required
                    onChange={(e) => setClaimFile(e.target.files?.[0] ?? null)}
                    className="rounded-lg bg-black/40 border border-white/15 px-3 py-2 text-xs file:mr-3 file:rounded-md file:border-0 file:bg-white/10 file:px-3 file:py-1 file:text-fg"
                  />
                </label>
                <label className="grid gap-1">
                  <span className="text-[10px] uppercase tracking-[0.2em] text-fg-dim">
                    Note (optional)
                  </span>
                  <textarea
                    value={claimNote}
                    onChange={(e) => setClaimNote(e.target.value)}
                    rows={2}
                    placeholder="Anything we should know about the post…"
                    className="rounded-lg bg-black/40 border border-white/15 px-3 py-2 text-sm resize-none"
                  />
                </label>
                {submitMessage && (
                  <div
                    className={clsx(
                      "text-[11px] rounded-md px-3 py-2",
                      submitState === "ok"
                        ? "bg-accent/10 text-accent border border-accent/30"
                        : "neon-error"
                    )}
                  >
                    {submitMessage}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={submitState === "submitting" || !cloudEnabled || !username}
                  className={clsx(
                    "neon-btn rounded-lg px-4 py-2.5 text-sm font-semibold",
                    (submitState === "submitting" || !cloudEnabled || !username) &&
                      "opacity-60 cursor-not-allowed"
                  )}
                >
                  {submitState === "submitting" ? "Submitting…" : "Submit viral claim"}
                </button>
              </form>

              {/* My claims list */}
              {username && claimsLoaded && (
                <div className="grid gap-2 mt-2">
                  <div className="text-[10px] uppercase tracking-[0.3em] text-fg-dim">
                    My submissions
                  </div>
                  {myClaims.length === 0 ? (
                    <div className="text-[11px] text-fg-dim">
                      No claims yet — submit one above.
                    </div>
                  ) : (
                    <ul className="grid gap-1.5">
                      {myClaims.map((c) => (
                        <li
                          key={c.id}
                          className="rounded-md border border-white/10 bg-black/30 px-3 py-2 text-[11px] flex flex-wrap items-center justify-between gap-2"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="capitalize font-semibold">{c.platform}</span>
                            <a
                              href={c.postUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-accent truncate max-w-[180px]"
                            >
                              post ↗
                            </a>
                            <a
                              href={c.screenshotUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-fg-dim hover:text-fg"
                            >
                              screenshot ↗
                            </a>
                          </div>
                          <StatusBadge status={c.status} />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </div>
  );
}

function StatusBadge({ status }: { status: ViralClaim["status"] }) {
  const map: Record<ViralClaim["status"], { label: string; cls: string }> = {
    pending: {
      label: "Under review",
      cls: "border-white/15 bg-white/5 text-fg-dim",
    },
    approved: {
      label: "Approved",
      cls: "border-accent/40 bg-accent/10 text-accent",
    },
    paid: {
      label: "Reward sent",
      cls: "border-amber-300/40 bg-amber-300/10 text-amber-300",
    },
    rejected: {
      label: "Rejected",
      cls: "border-red-400/40 bg-red-400/10 text-red-300",
    },
  };
  const m = map[status] || map.pending;
  return (
    <span
      className={clsx(
        "rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] border whitespace-nowrap",
        m.cls
      )}
    >
      {m.label}
    </span>
  );
}
