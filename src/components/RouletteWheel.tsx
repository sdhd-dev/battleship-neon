"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AppliedAward,
  POWER_DEFS,
  ROULETTE_PRIZES,
  RoulettePrize,
  applyRoulettePrize,
  rollRoulettePrize,
} from "@/lib/powers";

interface Props {
  open: boolean;
  spins: number; // total spins to perform
  onClose: () => void;
  onAwarded: (awards: AppliedAward[]) => void;
}

const SPIN_MS = 4200;
const CELEBRATE_MS = 1800;

type Phase = "idle" | "spinning" | "celebrating" | "done";

interface SpinPlan {
  prize: RoulettePrize;
  rotationTo: number;
}

// Build a plan of spins up-front so each useEffect step is deterministic
// and stays free of impure calls during render. Math.random is invoked
// here in module-scope helpers (safe under react-hooks/purity).
function buildPlan(spins: number, segCount: number): SpinPlan[] {
  const segAngle = 360 / segCount;
  const plan: SpinPlan[] = [];
  let cumulative = 0;
  for (let i = 0; i < spins; i++) {
    const prize = rollRoulettePrize();
    const targetIdx = ROULETTE_PRIZES.findIndex((p) => p.id === prize.id);
    const fullTurns = 5 + Math.floor(Math.random() * 3);
    const targetCenter = targetIdx * segAngle + segAngle / 2;
    const final = fullTurns * 360 - targetCenter;
    cumulative = cumulative - (cumulative % 360) + final;
    plan.push({ prize, rotationTo: cumulative });
  }
  return plan;
}

// Visual roulette wheel. Pre-builds a deterministic spin plan when it
// opens, then drives each phase via timed useEffect transitions —
// avoiding both nested setTimeouts and the cascading-state-in-effect
// lint rule by always returning a clean cleanup.
export function RouletteWheel({ open, spins, onClose, onAwarded }: Props) {
  const segments = ROULETTE_PRIZES;
  const segCount = segments.length;

  const [plan, setPlan] = useState<SpinPlan[]>([]);
  const [spinIndex, setSpinIndex] = useState(0);
  const [rotation, setRotation] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [activePrize, setActivePrize] = useState<RoulettePrize | null>(null);
  const [awards, setAwards] = useState<AppliedAward[]>([]);
  const reportedRef = useRef(false);

  // (Re)build plan whenever this overlay opens.
  useEffect(() => {
    if (!open) return;
    const next = buildPlan(spins, segCount);
    /* eslint-disable react-hooks/set-state-in-effect */
    setPlan(next);
    setSpinIndex(0);
    setRotation(0);
    setActivePrize(null);
    setAwards([]);
    setPhase("idle");
    /* eslint-enable react-hooks/set-state-in-effect */
    reportedRef.current = false;
    const start = setTimeout(() => setPhase("spinning"), 400);
    return () => clearTimeout(start);
  }, [open, spins, segCount]);

  // Drive transitions: idle → spinning → celebrating → next spin or done.
  useEffect(() => {
    if (!open) return;
    if (phase === "spinning") {
      const target = plan[spinIndex];
      if (!target) return;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRotation(target.rotationTo);
      const id = setTimeout(() => {
        const award = applyRoulettePrize(target.prize);
        setAwards((cur) => [...cur, award]);
        setActivePrize(target.prize);
        setPhase("celebrating");
      }, SPIN_MS);
      return () => clearTimeout(id);
    }
    if (phase === "celebrating") {
      const id = setTimeout(() => {
        if (spinIndex + 1 < plan.length) {
          setSpinIndex(spinIndex + 1);
          setActivePrize(null);
          setPhase("spinning");
        } else {
          setPhase("done");
        }
      }, CELEBRATE_MS);
      return () => clearTimeout(id);
    }
    if (phase === "done" && !reportedRef.current) {
      reportedRef.current = true;
      onAwarded(awards);
    }
  }, [phase, plan, spinIndex, open, awards, onAwarded]);

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        key="roulette-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] grid place-items-center p-4"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, rgba(8,12,30,0.85), rgba(0,0,0,0.95))",
          backdropFilter: "blur(12px)",
        }}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 22 }}
          className="glass neon-border rounded-3xl p-5 sm:p-8 max-w-md w-full text-center"
        >
          <div className="text-[10px] sm:text-xs uppercase tracking-[0.4em] text-fg-dim">
            Word decoded · Reward roll
          </div>
          <h2 className="text-2xl sm:text-4xl font-extrabold title-grad mt-1">
            🎰 Spin {Math.min(spinIndex + (phase === "spinning" ? 1 : 0), spins)} / {spins}
          </h2>

          <div className="relative w-[260px] sm:w-[320px] h-[260px] sm:h-[320px] mx-auto mt-6">
            {/* Pointer */}
            <div
              className="absolute left-1/2 -top-2 -translate-x-1/2 z-20 text-3xl"
              style={{ filter: "drop-shadow(0 0 12px var(--accent))" }}
            >
              ▼
            </div>
            {/* Wheel */}
            <motion.div
              animate={{ rotate: rotation }}
              transition={{ duration: SPIN_MS / 1000, ease: [0.18, 0.68, 0.16, 1] }}
              className="absolute inset-0 rounded-full"
              style={{
                boxShadow:
                  "0 0 0 4px color-mix(in oklab, var(--accent) 40%, transparent), 0 0 38px color-mix(in oklab, var(--accent-2) 50%, transparent), inset 0 0 26px rgba(0,0,0,0.6)",
              }}
            >
              <RouletteSvg segments={segments} />
            </motion.div>
            {/* Hub */}
            <div className="absolute inset-0 grid place-items-center pointer-events-none">
              <div
                className="w-12 h-12 rounded-full"
                style={{
                  background: "radial-gradient(circle, var(--accent) 20%, var(--accent-2) 80%)",
                  boxShadow: "0 0 22px var(--accent), inset 0 0 14px rgba(0,0,0,0.45)",
                }}
              />
            </div>
          </div>

          <div className="mt-5 min-h-[64px]">
            <AnimatePresence mode="wait">
              {phase === "celebrating" && activePrize && (
                <motion.div
                  key={`prize-${spinIndex}`}
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.9, opacity: 0 }}
                  transition={{ type: "spring", stiffness: 280, damping: 18 }}
                  className="rounded-xl px-3 py-2 font-bold"
                  style={{
                    background: `linear-gradient(90deg, color-mix(in oklab, ${activePrize.color} 30%, transparent), transparent)`,
                    color: activePrize.color,
                    textShadow: `0 0 14px ${activePrize.color}`,
                  }}
                >
                  <div className="text-3xl">{activePrize.icon}</div>
                  <div className="text-base sm:text-lg">{activePrize.label}</div>
                  <div className="text-xs text-fg-dim font-normal mt-0.5">
                    {activePrize.description}
                  </div>
                </motion.div>
              )}
              {phase === "spinning" && (
                <motion.div
                  key={`spinning-${spinIndex}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-fg-dim text-sm"
                >
                  Spinning…
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {phase === "done" && (
            <RouletteSummary awards={awards} onClose={onClose} />
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function RouletteSvg({ segments }: { segments: RoulettePrize[] }) {
  const segCount = segments.length;
  const segAngle = 360 / segCount;
  const RADIUS = 150;
  const CENTER = 160;
  const slices = useMemo(() => {
    return segments.map((seg, i) => {
      const startAngle = i * segAngle - 90 - segAngle / 2;
      const endAngle = startAngle + segAngle;
      const start = polar(CENTER, CENTER, RADIUS, startAngle);
      const end = polar(CENTER, CENTER, RADIUS, endAngle);
      const largeArc = segAngle > 180 ? 1 : 0;
      const path = `M ${CENTER} ${CENTER} L ${start.x} ${start.y} A ${RADIUS} ${RADIUS} 0 ${largeArc} 1 ${end.x} ${end.y} Z`;
      const labelAngle = startAngle + segAngle / 2;
      const labelPos = polar(CENTER, CENTER, RADIUS * 0.66, labelAngle);
      return { seg, path, labelPos, labelAngle };
    });
  }, [segments, segAngle]);

  return (
    <svg viewBox="0 0 320 320" className="w-full h-full">
      {slices.map(({ seg, path }, i) => (
        <path
          key={`p-${i}`}
          d={path}
          fill={`color-mix(in oklab, ${seg.color} ${i % 2 === 0 ? 70 : 45}%, #0a0f24)`}
          stroke="rgba(255,255,255,0.18)"
          strokeWidth={1}
        />
      ))}
      {slices.map(({ seg, labelPos, labelAngle }, i) => (
        <g key={`l-${i}`} transform={`translate(${labelPos.x}, ${labelPos.y}) rotate(${labelAngle + 90})`}>
          <text
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize="22"
            style={{ filter: `drop-shadow(0 0 6px ${seg.color})` }}
          >
            {seg.icon}
          </text>
        </g>
      ))}
    </svg>
  );
}

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function RouletteSummary({
  awards,
  onClose,
}: {
  awards: AppliedAward[];
  onClose: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="grid gap-3 mt-2"
    >
      <div className="text-xs uppercase tracking-[0.3em] text-fg-dim">
        Loot acquired
      </div>
      <ul className="grid gap-1.5">
        {awards.map((a, i) => {
          const power = a.powerType ? POWER_DEFS[a.powerType] : null;
          return (
            <li
              key={i}
              className="flex items-center justify-between rounded-lg border border-white/10 bg-black/30 px-3 py-2"
            >
              <span className="flex items-center gap-2 text-sm">
                <span className="text-xl">{power?.icon ?? a.prize.icon}</span>
                <span style={{ color: a.prize.color, textShadow: `0 0 8px ${a.prize.color}` }}>
                  {power?.name ?? a.prize.label}
                </span>
              </span>
              <span
                className="text-sm font-bold tabular-nums"
                style={{
                  color: a.coins ? "#fbbf24" : "var(--accent)",
                  textShadow: a.coins ? "0 0 8px #fbbf24" : "0 0 8px var(--accent)",
                }}
              >
                {a.coins ? `+${a.coins} ⚓` : `×${a.powerCount ?? 1}`}
              </span>
            </li>
          );
        })}
      </ul>
      <button
        onClick={onClose}
        className="neon-btn rounded-xl px-4 py-3 font-semibold mt-2"
      >
        Continue
      </button>
    </motion.div>
  );
}
