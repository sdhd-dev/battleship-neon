"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";

interface Props {
  open: boolean;
  onClose: () => void;
}

interface Section {
  id: string;
  icon: string;
  title: string;
  color: string;
  body: { title: string; desc: string }[];
}

const SECTIONS: Section[] = [
  {
    id: "modes",
    icon: "🎮",
    title: "Game Modes",
    color: "#00f0ff",
    body: [
      {
        title: "🎓 Training",
        desc: "5-step tutorial — placement, shooting, hunt strategy. Earn the Graduate badge + 25 ⚓.",
      },
      {
        title: "⚔ Classic",
        desc: "No timer, just strategy. Sink the AI fleet at your own pace.",
      },
      {
        title: "⏱ Blitz · 3:00",
        desc: "Three-minute pressure cooker. Miss the timer, lose the war.",
      },
      {
        title: "⚡ Power Mode",
        desc: "Use Shield, Smokescreen, Airstrike, Precision, and Radar earned from Secret Word.",
      },
      {
        title: "🔤 Secret Word",
        desc: "Decode a hidden word from ship cells. Win to spin the roulette for battle powers.",
      },
      {
        title: "🌐 Online 1v1",
        desc: "Private lobby with chat. Share the invite link, trade salvos in real time.",
      },
      {
        title: "⚔️ Team 3v3",
        desc: "Six-player squad battle. Three vs three boards, alternating fire.",
      },
    ],
  },
  {
    id: "coins",
    icon: "⚓",
    title: "Earn Naval Coins",
    color: "#fbbf24",
    body: [
      { title: "Win games", desc: "Coin payout scales with mode, difficulty, and accuracy." },
      { title: "Daily win bonus", desc: "First win of the day gives a streak bonus." },
      { title: "Referrals", desc: "Both you and your friend get +50 ⚓ when they sign up." },
      { title: "Social sharing", desc: "Earn coins when you share a victory card." },
    ],
  },
  {
    id: "powers",
    icon: "⚡",
    title: "Powers",
    color: "#a78bfa",
    body: [
      {
        title: "🎯 Precision Strike",
        desc: "Guaranteed hit on a random unrevealed enemy ship cell.",
      },
      { title: "💣 Airstrike", desc: "Hit a chosen cell plus 2 cells in a row." },
      { title: "🔍 Radar Scan", desc: "Reveal a 2x2 area without firing a shot." },
      { title: "🛡️ Shield", desc: "Auto-block the next enemy shot." },
      { title: "💨 Smokescreen", desc: "Hide a 3x3 zone — enemy shots miss it for 2 turns." },
      {
        title: "How to earn",
        desc: "Win Secret Word mode and spin the roulette. More wins = more spins per round.",
      },
    ],
  },
  {
    id: "clans",
    icon: "🛡️",
    title: "Clans",
    color: "#22d3ee",
    body: [
      { title: "Create or join", desc: "Form a crew or join an existing clan from the Clans page." },
      { title: "Clan wars", desc: "Battle other clans to earn glory and clan bank deposits." },
      { title: "Clan bank", desc: "Members deposit coins; the bank funds wars and perks." },
    ],
  },
  {
    id: "tournament",
    icon: "🏆",
    title: "Weekly Tournament",
    color: "#f97316",
    body: [
      { title: "Top 3 win prizes", desc: "Real prizes for the top three captains every week." },
      { title: "Resets every Monday", desc: "Weekly leaderboard zeroes out at the start of each week (UTC)." },
      { title: "Climb fast", desc: "+25 per win, −10 per loss, +10 bonus for 100% accuracy wins." },
    ],
  },
  {
    id: "secret",
    icon: "🔤",
    title: "Secret Word Goal",
    color: "#5eead4",
    body: [
      {
        title: "Find all 10 unique words",
        desc: "Decode hidden words from ship cells. The full list stays secret — earn each by playing.",
      },
      {
        title: "Unlock Custom Ship Workshop",
        desc: "Decode all 10 to unlock /workshop and forge your legendary vessel.",
      },
      {
        title: "Repeats are fine",
        desc: "Hitting the same word twice still counts only once toward the 10/10 goal.",
      },
    ],
  },
  {
    id: "shop",
    icon: "🛒",
    title: "Shop",
    color: "#ff2bd6",
    body: [
      { title: "Skins", desc: "Customize your fleet with neon ship skins." },
      { title: "Themes & Badges", desc: "Re-paint the board and flex new badges." },
      { title: "Pro plan", desc: "Unlock premium skins and supporter perks." },
    ],
  },
];

export function HowToPlay({ open, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="how-to-play"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] grid place-items-stretch overflow-y-auto"
          style={{
            background:
              "radial-gradient(circle at 50% 50%, rgba(8,12,30,0.92), rgba(0,0,0,0.97))",
            backdropFilter: "blur(14px)",
          }}
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 26 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12"
          >
            <button
              onClick={onClose}
              aria-label="Close guide"
              className="absolute right-4 top-4 sm:right-6 sm:top-6 rounded-full w-11 h-11 grid place-items-center border border-white/15 hover:bg-white/5 text-base sm:text-lg neon-btn z-10"
            >
              ✕
            </button>

            <header className="text-center mb-8">
              <div className="text-[10px] sm:text-xs uppercase tracking-[0.4em] text-fg-dim">
                Captain&apos;s Manual
              </div>
              <h1 className="text-3xl sm:text-5xl font-extrabold title-grad mt-1">
                📖 How To Play
              </h1>
              <p className="text-fg-dim mt-3 text-sm sm:text-base max-w-2xl mx-auto leading-relaxed">
                Everything you need to dominate the seas — modes, coins, powers,
                clans, the weekly tournament, and the path to your custom ship.
              </p>
            </header>

            <div className="grid gap-5 sm:grid-cols-2">
              {SECTIONS.map((section) => (
                <motion.section
                  key={section.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4 }}
                  className="glass rounded-2xl p-5 relative overflow-hidden"
                  style={{
                    boxShadow: `0 0 0 1px color-mix(in oklab, ${section.color} 45%, transparent), 0 0 26px color-mix(in oklab, ${section.color} 25%, transparent)`,
                  }}
                >
                  <div
                    aria-hidden
                    className="absolute -top-12 -right-12 w-40 h-40 rounded-full pointer-events-none"
                    style={{
                      background: `radial-gradient(circle, color-mix(in oklab, ${section.color} 35%, transparent), transparent 70%)`,
                    }}
                  />
                  <div className="relative z-10">
                    <div className="flex items-baseline gap-3 mb-3">
                      <span
                        className="text-3xl"
                        style={{ filter: `drop-shadow(0 0 10px ${section.color})` }}
                      >
                        {section.icon}
                      </span>
                      <h2
                        className="text-xl sm:text-2xl font-extrabold"
                        style={{
                          color: section.color,
                          textShadow: `0 0 12px ${section.color}`,
                        }}
                      >
                        {section.title}
                      </h2>
                    </div>
                    <ul className="grid gap-2.5">
                      {section.body.map((row, i) => (
                        <li
                          key={i}
                          className="rounded-xl border border-white/10 bg-black/30 p-3"
                        >
                          <div
                            className="font-bold text-sm"
                            style={{ color: section.color }}
                          >
                            {row.title}
                          </div>
                          <div className="text-sm text-fg-dim mt-0.5 leading-relaxed">
                            {row.desc}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                </motion.section>
              ))}
            </div>

            <section
              className="rounded-2xl mt-6 p-5 grid sm:grid-cols-[1fr_auto] gap-3 items-center"
              style={{
                color: "#2AABEE",
                border: "1px solid rgba(42,171,238,0.55)",
                background: "rgba(42,171,238,0.10)",
                boxShadow: "0 0 22px rgba(42,171,238,0.35)",
              }}
            >
              <div>
                <div className="text-[10px] uppercase tracking-[0.4em] text-fg-dim">
                  Join Community
                </div>
                <h3
                  className="text-xl sm:text-2xl font-extrabold mt-1"
                  style={{ textShadow: "0 0 12px #2AABEE" }}
                >
                  💬 Battleship.Neon on Telegram
                </h3>
                <p className="text-sm text-fg-dim mt-1 leading-relaxed">
                  Share feedback, report bugs, suggest new powers, find rivals
                  for matches. Captains welcome.
                </p>
              </div>
              <a
                href="https://t.me/battleshipNfactorial"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-xl px-5 py-3 font-bold inline-flex items-center justify-center gap-2 min-h-[44px]"
                style={{
                  color: "#2AABEE",
                  border: "1px solid #2AABEE",
                  background: "rgba(42,171,238,0.18)",
                  textShadow: "0 0 8px #2AABEE",
                }}
              >
                💬 Open Telegram
              </a>
            </section>

            <div className="text-center mt-8 pb-4">
              <button
                onClick={onClose}
                className="neon-btn rounded-2xl px-6 py-3 font-semibold pulse-glow min-h-[44px]"
              >
                ⚓ Set sail
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
