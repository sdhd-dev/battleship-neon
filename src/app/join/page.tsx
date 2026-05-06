"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { stashPendingReferral } from "@/lib/referrals";
import { SiteFooter } from "@/components/SiteFooter";

export default function JoinPage() {
  return (
    <Suspense fallback={<JoinShell />}>
      <JoinInner />
    </Suspense>
  );
}

function JoinShell() {
  return <div className="bg-field min-h-screen" />;
}

function JoinInner() {
  const router = useRouter();
  const search = useSearchParams();
  const ref = (search.get("ref") || "").trim().toLowerCase();
  const [stashed, setStashed] = useState(false);

  useEffect(() => {
    if (!ref) return;
    stashPendingReferral(ref);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStashed(true);
  }, [ref]);

  return (
    <div className="bg-field min-h-screen flex flex-col">
      <div className="flex-1 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass neon-border rounded-3xl p-8 max-w-lg w-full text-center"
      >
        <div className="text-[10px] uppercase tracking-[0.4em] text-fg-dim">
          Invite accepted
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold title-grad mt-2">
          {ref ? `${ref} invited you` : "Welcome aboard"}
        </h1>
        <p className="text-sm text-fg-dim mt-3 max-w-md mx-auto">
          {ref ? (
            <>
              Sign up now and you both get <strong>+50 ⚓ Naval Coins</strong>.
              Bonus is applied automatically when your callsign is created.
            </>
          ) : (
            <>No referral code in this link — but you can still sign up.</>
          )}
        </p>

        {stashed && (
          <div className="text-[11px] text-accent mt-3">
            ✓ Referral code stashed for sign-up
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 mt-6 justify-center">
          <button
            onClick={() => router.push("/auth?tab=signup")}
            className="neon-btn rounded-xl px-5 py-3 font-semibold pulse-glow"
          >
            Create my callsign
          </button>
          <Link
            href="/"
            className="rounded-xl px-5 py-3 border border-white/15 hover:bg-white/5 font-semibold inline-block"
          >
            Browse first
          </Link>
        </div>
      </motion.div>
      </div>
      <SiteFooter />
    </div>
  );
}
