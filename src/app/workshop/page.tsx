"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import clsx from "clsx";
import { TopBar } from "@/components/TopBar";
import { UpgradeModal } from "@/components/UpgradeModal";
import { SecretCodeInput } from "@/components/SecretCodeInput";
import { useAuth } from "@/components/AuthProvider";
import { CustomShip, CustomShipPower } from "@/lib/storage";
import { POWER_DEFS } from "@/lib/powers";
import {
  FREE_POWER_SLOTS,
  MAX_SHIP_POWERS,
  SHIP_KIND_DEFS,
  ShipKind,
  WORKSHOP_BADGES,
  WORKSHOP_POWERS,
  WORKSHOP_SKINS,
  findShipKind,
  findSkin,
  validateShipName,
} from "@/lib/workshop";
import { TOTAL_SECRET_WORDS, decodedWordsCount } from "@/lib/powers";

export default function WorkshopPage() {
  const { profile, setProfile } = useAuth();
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const decoded = mounted ? decodedWordsCount(profile) : 0;
  const unlocked =
    mounted &&
    (profile.customShipUnlocked || decoded >= TOTAL_SECRET_WORDS);

  return (
    <div className="bg-field min-h-screen overflow-x-hidden max-w-[100vw]">
      <TopBar onUpgrade={() => setUpgradeOpen(true)} />
      <main className="relative z-10 max-w-6xl mx-auto px-4 py-6 sm:p-6 grid gap-6 pb-24">
        <header>
          <div className="text-[10px] uppercase tracking-[0.4em] text-fg-dim">
            Drydock · Live garage
          </div>
          <h1 className="text-3xl sm:text-5xl font-extrabold title-grad mt-1">
            ⚓ SHIP HANGAR
          </h1>
          <p className="text-fg-dim mt-2 text-sm sm:text-base">
            Tweak everything live. Your changes show on the ship in real time.
          </p>
        </header>

        {!mounted ? (
          <div className="glass rounded-2xl p-8 text-center text-fg-dim">
            Loading…
          </div>
        ) : unlocked ? (
          <Garage
            existing={profile.customShip ?? null}
            onSave={(ship) => setProfile({ ...profile, customShip: ship })}
          />
        ) : (
          <WorkshopLocked decoded={decoded} />
        )}
      </main>
      <UpgradeModal open={upgradeOpen} onClose={() => setUpgradeOpen(false)} />
    </div>
  );
}

function WorkshopLocked({ decoded }: { decoded: number }) {
  const remaining = TOTAL_SECRET_WORDS - decoded;
  return (
    <div className="grid gap-5">
      <div className="glass neon-border rounded-3xl p-6 sm:p-10 relative overflow-hidden text-center">
        <motion.div
          aria-hidden
          className="absolute -top-32 -right-32 w-96 h-96 rounded-full pointer-events-none"
          style={{
            background:
              "radial-gradient(circle, color-mix(in oklab, #14b8a6 35%, transparent), transparent 70%)",
          }}
          animate={{ scale: [1, 1.18, 1] }}
          transition={{ duration: 9, repeat: Infinity }}
        />
        <div className="relative z-10 max-w-xl mx-auto">
          <div className="text-6xl mb-3" aria-hidden>
            🔒
          </div>
          <div className="text-[10px] sm:text-xs uppercase tracking-[0.4em] text-fg-dim">
            Hangar sealed
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold mt-2 title-grad">
            Decode all {TOTAL_SECRET_WORDS} secret words to enter
          </h2>
          <p className="text-fg-dim mt-3 text-sm sm:text-base leading-relaxed">
            Already know the codes? Type each word below. Or play Secret Word
            mode to discover them in battle — every unique word you decode
            brings the hangar closer to opening.
          </p>
          <div className="text-[11px] text-fg-dim mt-3">
            {remaining > 0
              ? `${remaining} more word${remaining === 1 ? "" : "s"} to unlock.`
              : "All words decoded! Refresh the page."}
          </div>
        </div>
      </div>

      <div className="max-w-xl mx-auto w-full grid gap-3">
        <SecretCodeInput />
        <Link
          href="/"
          className="block text-center rounded-xl border border-white/15 hover:bg-white/5 px-5 py-3 text-sm font-semibold min-h-[44px]"
        >
          🔤 Or play Secret Word mode →
        </Link>
      </div>
    </div>
  );
}

function Garage({
  existing,
  onSave,
}: {
  existing: CustomShip | null;
  onSave: (ship: CustomShip) => void;
}) {
  const [type, setType] = useState<ShipKind>(existing?.type ?? "destroyer");
  const [name, setName] = useState<string>(existing?.name ?? "");
  const [skinId, setSkinId] = useState<string>(
    existing?.skin ?? WORKSHOP_SKINS[0].id
  );
  const initialPowers = existing?.powers?.length ? existing.powers : ["radar" as CustomShipPower];
  const [powers, setPowers] = useState<(CustomShipPower | null)[]>(() => {
    const arr: (CustomShipPower | null)[] = [null, null, null];
    initialPowers.slice(0, MAX_SHIP_POWERS).forEach((p, i) => {
      arr[i] = p;
    });
    return arr;
  });
  const [badge, setBadge] = useState<string>(
    existing?.badge ?? WORKSHOP_BADGES[0]
  );
  const [donateFor, setDonateFor] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const kind = findShipKind(type);
  const skin = findSkin(skinId);
  const nameValidation = validateShipName(name);
  const canSave = nameValidation.ok;

  const setPowerAt = (idx: number, p: CustomShipPower | null) => {
    setPowers((prev) => prev.map((cur, i) => (i === idx ? p : cur)));
    setSaved(false);
  };

  const goSave = () => {
    if (!nameValidation.ok) return;
    const filtered = powers.filter(
      (p): p is CustomShipPower => p !== null
    );
    onSave({
      type,
      name: name.trim(),
      skin: skinId,
      powers: filtered,
      badge,
      createdAt: existing?.createdAt ?? Date.now(),
    });
    setSaved(true);
  };

  return (
    <div className="grid gap-5">
      <ShipShowcase
        kind={kind}
        name={name || "Unnamed"}
        skin={skin}
        badge={badge}
        powers={powers}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Slot title="Hull" tag="01" hint="Frame & length">
          <div className="grid gap-2">
            {SHIP_KIND_DEFS.map((d) => {
              const selected = type === d.id;
              return (
                <button
                  key={d.id}
                  onClick={() => {
                    if (d.premium) {
                      setDonateFor(d.name);
                      return;
                    }
                    setType(d.id);
                    setSaved(false);
                  }}
                  className={clsx(
                    "rounded-xl border px-3 py-2.5 text-left relative overflow-hidden flex items-center gap-3 min-h-[58px]",
                    selected && !d.premium
                      ? "border-accent/70 bg-accent/10 shadow-[0_0_18px_rgba(0,240,255,0.3)]"
                      : d.premium
                        ? "border-amber-300/40 hover:border-amber-300/70"
                        : "border-white/10 hover:border-white/30"
                  )}
                >
                  <span className="flex gap-0.5 shrink-0">
                    {Array.from({ length: d.length }).map((_, i) => (
                      <span
                        key={i}
                        className="w-2 h-5 rounded-sm"
                        style={{
                          background: selected && !d.premium
                            ? skin.gradient
                            : "rgba(255,255,255,0.2)",
                        }}
                      />
                    ))}
                  </span>
                  <span className="grid flex-1 min-w-0">
                    <span className="font-extrabold text-sm">{d.name}</span>
                    <span className="text-[11px] text-fg-dim truncate">
                      {d.length} cells · {d.desc.split(".")[0]}
                    </span>
                  </span>
                  {d.premium && (
                    <span
                      className="text-[10px] font-bold rounded-full px-2 py-0.5 border shrink-0"
                      style={{
                        color: "#fbbf24",
                        textShadow: "0 0 8px #fbbf24",
                        borderColor: "rgba(251,191,36,0.5)",
                        background: "rgba(251,191,36,0.12)",
                      }}
                    >
                      💙 Premium
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </Slot>

        <Slot title="Identity" tag="02" hint="Callsign & emblem">
          <div className="grid gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-[0.3em] text-fg-dim">
                Name
              </label>
              <input
                value={name}
                onChange={(e) => {
                  setName(e.target.value.slice(0, 12));
                  setSaved(false);
                }}
                placeholder="e.g. Nebula"
                maxLength={12}
                className="mt-1 w-full rounded-xl bg-black/40 border border-white/15 px-4 py-3 text-base font-mono tracking-wider min-h-[44px]"
              />
              <div
                className={clsx(
                  "text-[11px] mt-1",
                  nameValidation.ok ? "text-fg-dim" : "text-rose-300"
                )}
              >
                {nameValidation.ok
                  ? "Looking sharp, captain."
                  : nameValidation.msg}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.3em] text-fg-dim mb-1.5">
                Badge
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                {WORKSHOP_BADGES.map((b) => (
                  <button
                    key={b}
                    onClick={() => {
                      setBadge(b);
                      setSaved(false);
                    }}
                    className={clsx(
                      "rounded-lg border text-xl grid place-items-center min-h-[44px]",
                      badge === b
                        ? "border-accent/70 bg-accent/15 shadow-[0_0_14px_rgba(0,240,255,0.3)]"
                        : "border-white/10 hover:border-white/30"
                    )}
                  >
                    {b}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Slot>

        <Slot title="Hull paint" tag="03" hint="Surface coating">
          <div className="grid grid-cols-3 gap-2">
            {WORKSHOP_SKINS.map((s) => {
              const selected = skinId === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => {
                    if (s.premium) {
                      setDonateFor(`${s.name} skin`);
                      return;
                    }
                    setSkinId(s.id);
                    setSaved(false);
                  }}
                  className={clsx(
                    "rounded-xl border p-2 text-left relative overflow-hidden min-h-[64px]",
                    selected && !s.premium
                      ? "border-accent/70 shadow-[0_0_18px_rgba(0,240,255,0.35)]"
                      : s.premium
                        ? "border-amber-300/50"
                        : "border-white/10 hover:border-white/30"
                  )}
                >
                  <div
                    aria-hidden
                    className="absolute inset-0 opacity-90 pointer-events-none"
                    style={{ background: s.gradient }}
                  />
                  <div className="absolute inset-0 bg-black/30 pointer-events-none" />
                  {s.premium && (
                    <span
                      className="absolute top-1 right-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold border z-10"
                      style={{
                        color: "#fbbf24",
                        textShadow: "0 0 8px #fbbf24",
                        borderColor: "rgba(251,191,36,0.6)",
                        background: "rgba(251,191,36,0.5)",
                      }}
                    >
                      💙
                    </span>
                  )}
                  <div className="relative z-10">
                    <div
                      className="text-[12px] font-extrabold leading-tight"
                      style={{ textShadow: `0 0 8px ${s.glow}` }}
                    >
                      {s.name}
                    </div>
                    <div className="text-[9px] text-white/80">
                      {s.premium ? "Premium" : "Free"}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </Slot>

        <Slot
          title="Superpowers"
          tag="04"
          hint={`${FREE_POWER_SLOTS} free slot · ${MAX_SHIP_POWERS - FREE_POWER_SLOTS} premium`}
        >
          <div className="grid gap-2.5">
            {Array.from({ length: MAX_SHIP_POWERS }).map((_, i) => (
              <PowerSlot
                key={i}
                index={i}
                value={powers[i]}
                premium={i >= FREE_POWER_SLOTS}
                onPick={(p) => setPowerAt(i, p)}
                onLockedClick={() =>
                  setDonateFor(`Premium power slot ${i + 1}`)
                }
              />
            ))}
          </div>
        </Slot>
      </div>

      <div className="sticky bottom-3 z-20 flex flex-col-reverse sm:flex-row sm:items-center gap-3">
        <div className="text-xs text-fg-dim sm:flex-1">
          {kind.name} · {skin.name} ·{" "}
          {powers.filter((p) => p).length} power
          {powers.filter((p) => p).length === 1 ? "" : "s"}
        </div>
        <button
          onClick={goSave}
          disabled={!canSave}
          className={clsx(
            "rounded-2xl px-6 py-3 font-extrabold text-base min-h-[48px]",
            canSave
              ? "neon-btn pulse-glow"
              : "border border-white/15 text-fg-dim cursor-not-allowed"
          )}
        >
          ⚓ FORGE SHIP
        </button>
      </div>

      <AnimatePresence>
        {saved && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="rounded-xl px-4 py-3 border text-sm font-bold text-center"
            style={{
              color: "#5eead4",
              textShadow: "0 0 8px #14b8a6",
              borderColor: "rgba(20,184,166,0.55)",
              background: "rgba(20,184,166,0.12)",
            }}
          >
            🎉 Ship forged! It is now active in every game mode.
          </motion.div>
        )}
      </AnimatePresence>

      <DonationModal
        open={!!donateFor}
        item={donateFor ?? ""}
        onClose={() => setDonateFor(null)}
      />
    </div>
  );
}

function ShipShowcase({
  kind,
  name,
  skin,
  badge,
  powers,
}: {
  kind: ReturnType<typeof findShipKind>;
  name: string;
  skin: ReturnType<typeof findSkin>;
  badge: string;
  powers: (CustomShipPower | null)[];
}) {
  const cells = useMemo(
    () => Array.from({ length: kind.length }),
    [kind.length]
  );
  const equipped = powers.filter(
    (p): p is CustomShipPower => p !== null
  );

  return (
    <div className="glass neon-border rounded-3xl p-5 sm:p-7 relative overflow-hidden">
      <motion.div
        aria-hidden
        className="absolute -top-24 -left-24 w-96 h-96 rounded-full pointer-events-none"
        style={{
          background: `radial-gradient(circle, color-mix(in oklab, ${skin.glow} 35%, transparent), transparent 70%)`,
        }}
        animate={{ scale: [1, 1.15, 1], opacity: [0.6, 0.9, 0.6] }}
        transition={{ duration: 6, repeat: Infinity }}
      />
      <motion.div
        aria-hidden
        className="absolute -bottom-32 -right-24 w-96 h-96 rounded-full pointer-events-none"
        style={{
          background: `radial-gradient(circle, color-mix(in oklab, ${skin.glow} 25%, transparent), transparent 70%)`,
        }}
        animate={{ scale: [1.1, 1, 1.1] }}
        transition={{ duration: 8, repeat: Infinity }}
      />

      <div className="relative z-10 grid gap-4">
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <div>
            <div className="text-[10px] uppercase tracking-[0.4em] text-fg-dim">
              Hangar bay · live preview
            </div>
            <div
              className="text-2xl sm:text-4xl font-extrabold mt-1"
              style={{ textShadow: `0 0 18px ${skin.glow}` }}
            >
              {badge} {name}
            </div>
          </div>
          <div className="text-[11px] text-fg-dim">
            {kind.name} · {kind.length} cells · {skin.name}
          </div>
        </div>

        <div className="rounded-2xl p-4 sm:p-5 border border-white/10 bg-black/40 grid place-items-center min-h-[120px]">
          <motion.div
            key={`${kind.id}-${skin.id}-${badge}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="flex gap-1.5"
          >
            {cells.map((_, i) => (
              <div
                key={i}
                className="w-10 h-10 sm:w-14 sm:h-14 rounded-md relative overflow-hidden border border-white/15"
                style={{
                  background: skin.gradient,
                  boxShadow: `0 0 18px color-mix(in oklab, ${skin.glow} 30%, transparent)`,
                }}
              >
                {i === 0 && (
                  <span className="absolute inset-0 grid place-items-center text-lg sm:text-xl">
                    {badge}
                  </span>
                )}
              </div>
            ))}
          </motion.div>
        </div>

        {equipped.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {equipped.map((p, i) => {
              const def = POWER_DEFS[p];
              return (
                <div
                  key={`${p}-${i}`}
                  className="rounded-full px-3 py-1.5 border text-xs flex items-center gap-2"
                  style={{
                    borderColor: def.color,
                    background: `color-mix(in oklab, ${def.color} 14%, transparent)`,
                  }}
                >
                  <span style={{ filter: `drop-shadow(0 0 6px ${def.color})` }}>
                    {def.icon}
                  </span>
                  <span className="font-bold" style={{ color: def.color }}>
                    {def.name}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Slot({
  title,
  tag,
  hint,
  children,
}: {
  title: string;
  tag: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="glass rounded-2xl p-4 sm:p-5 grid gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <div className="text-[9px] uppercase tracking-[0.4em] text-fg-dim">
            Slot {tag}
          </div>
          <h3 className="text-base sm:text-lg font-extrabold neon-text mt-0.5">
            {title}
          </h3>
        </div>
        <div className="text-[11px] text-fg-dim text-right">{hint}</div>
      </div>
      {children}
    </div>
  );
}

function PowerSlot({
  index,
  value,
  premium,
  onPick,
  onLockedClick,
}: {
  index: number;
  value: CustomShipPower | null;
  premium: boolean;
  onPick: (p: CustomShipPower | null) => void;
  onLockedClick: () => void;
}) {
  const def = value ? POWER_DEFS[value] : null;

  return (
    <div
      className={clsx(
        "rounded-xl border p-3 grid gap-2 relative overflow-hidden",
        premium
          ? "border-amber-300/40 bg-amber-300/[0.04]"
          : "border-white/10 bg-black/20"
      )}
    >
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-fg-dim">
        <span>Slot {index + 1}</span>
        {premium ? (
          <span
            className="rounded-full px-2 py-0.5 text-[9px] font-bold border"
            style={{
              color: "#fbbf24",
              textShadow: "0 0 8px #fbbf24",
              borderColor: "rgba(251,191,36,0.5)",
              background: "rgba(251,191,36,0.12)",
            }}
          >
            💙 Premium
          </span>
        ) : (
          <span className="rounded-full px-2 py-0.5 text-[9px] font-bold border border-white/15 text-fg-dim">
            Free
          </span>
        )}
        {def && !premium && (
          <button
            onClick={() => onPick(null)}
            className="ml-auto text-[10px] underline decoration-dotted underline-offset-2 text-fg-dim hover:text-white"
          >
            clear
          </button>
        )}
      </div>

      <div className="grid grid-cols-5 gap-1.5">
        {WORKSHOP_POWERS.map((p) => {
          const pdef = POWER_DEFS[p];
          const selected = value === p;
          return (
            <button
              key={p}
              onClick={() => {
                if (premium) {
                  onLockedClick();
                  return;
                }
                onPick(selected ? null : p);
              }}
              className={clsx(
                "rounded-lg border p-2 grid place-items-center min-h-[52px] relative",
                selected
                  ? "shadow-[0_0_14px_rgba(0,240,255,0.35)]"
                  : premium
                    ? "border-amber-300/30 hover:border-amber-300/60"
                    : "border-white/10 hover:border-white/30"
              )}
              style={
                selected
                  ? {
                      borderColor: pdef.color,
                      background: `color-mix(in oklab, ${pdef.color} 18%, transparent)`,
                    }
                  : undefined
              }
              title={`${pdef.name} — ${pdef.blurb}`}
            >
              <span
                className="text-xl"
                style={{ filter: `drop-shadow(0 0 6px ${pdef.color})` }}
              >
                {pdef.icon}
              </span>
              {premium && !selected && (
                <span className="absolute top-0.5 right-0.5 text-[9px]">
                  🔒
                </span>
              )}
            </button>
          );
        })}
      </div>

      {def ? (
        <div className="text-[11px] text-fg-dim">
          <span className="font-bold" style={{ color: def.color }}>
            {def.name}
          </span>{" "}
          — {def.blurb}
        </div>
      ) : (
        <div className="text-[11px] text-fg-dim">
          {premium
            ? "Tap any power to unlock this slot via creator donation."
            : "Pick a power to grant +1 at game start."}
        </div>
      )}
    </div>
  );
}

function DonationModal({
  open,
  item,
  onClose,
}: {
  open: boolean;
  item: string;
  onClose: () => void;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="donation-modal"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-[140] grid place-items-center p-4"
          style={{
            background:
              "radial-gradient(circle at 50% 50%, rgba(8,12,30,0.85), rgba(0,0,0,0.95))",
            backdropFilter: "blur(12px)",
          }}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ type: "spring", stiffness: 280, damping: 22 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-md rounded-3xl p-6 sm:p-8 text-center"
            style={{
              border: "2px solid #fbbf24",
              boxShadow:
                "0 0 0 1px rgba(251,191,36,0.5), 0 0 30px rgba(251,191,36,0.45), inset 0 0 18px rgba(180,83,9,0.25)",
              background:
                "radial-gradient(circle at 50% 0%, rgba(251,191,36,0.18), rgba(8,12,30,0.92))",
            }}
          >
            <div className="text-5xl mb-2" aria-hidden>
              💙
            </div>
            <div className="text-[10px] uppercase tracking-[0.4em] text-fg-dim">
              Premium · Donation
            </div>
            <h3
              className="text-2xl sm:text-3xl font-extrabold mt-1"
              style={{ color: "#fbbf24", textShadow: "0 0 12px #fbbf24" }}
            >
              Thank you for supporting
              <br /> Battleship.Neon!
            </h3>
            <p className="text-fg-dim mt-3 text-sm leading-relaxed">
              To unlock <strong className="text-white">{item}</strong>, send a
              donation and contact us:
            </p>
            <div className="mt-3 rounded-xl border border-amber-300/40 bg-amber-300/10 px-4 py-3 font-mono text-sm">
              Telegram:{" "}
              <a
                href="https://t.me/battleship_neon"
                target="_blank"
                rel="noopener noreferrer"
                className="font-bold underline"
                style={{ color: "#fbbf24" }}
              >
                @battleship_neon
              </a>
            </div>
            <p className="text-[11px] text-fg-dim mt-3 leading-relaxed">
              After manual verification, the creator will activate this premium
              feature on your account.
            </p>
            <button
              onClick={onClose}
              className="mt-5 neon-btn rounded-xl px-5 py-3 font-semibold min-h-[44px]"
            >
              Got it
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
