"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { TopBar } from "@/components/TopBar";
import { UpgradeModal } from "@/components/UpgradeModal";
import { useAuth } from "@/components/AuthProvider";
import { SiteFooter } from "@/components/SiteFooter";
import {
  ClanRow,
  createClan,
  fetchClanLeaderboard,
  getMyClan,
  joinClan,
  leaveClan,
  listClans,
} from "@/lib/clans";
import { notify } from "@/lib/notify";

const COLOR_PRESETS = ["#00f0ff", "#ff2bd6", "#7c5cff", "#fbbf24", "#22d3ee", "#84cc16", "#ef4444"];
const EMBLEMS = ["⚓", "⚔", "⚡", "☠", "🛡", "🔥", "🎯", "🌊", "🦈"];

export default function ClansPage() {
  const router = useRouter();
  const { username, cloudEnabled } = useAuth();
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [myClan, setMyClan] = useState<{ clan: ClanRow } | null>(null);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<ClanRow[]>([]);
  const [topClans, setTopClans] = useState<ClanRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!cloudEnabled) return;
    const [my, list, top] = await Promise.all([
      getMyClan(),
      listClans(search.trim() || undefined, 25),
      fetchClanLeaderboard(20),
    ]);
    setMyClan(my ? { clan: my.clan } : null);
    setResults(list);
    setTopClans(top);
    setLoading(false);
  }, [cloudEnabled, search]);

  useEffect(() => {
    if (!cloudEnabled) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    void refresh();
  }, [refresh, cloudEnabled]);

  const handleJoin = async (clanId: string) => {
    if (!username) return;
    const res = await joinClan(clanId, username);
    if (res.ok) {
      router.push(`/clans/${clanId}`);
    } else {
      notify(res.error ?? "Could not join clan.");
    }
  };

  const handleLeave = async () => {
    if (!confirm("Leave your current clan?")) return;
    const res = await leaveClan();
    if (res.ok) await refresh();
    else notify(res.error ?? "Could not leave clan.");
  };

  return (
    <div className="bg-field min-h-screen overflow-x-hidden max-w-[100vw]">
      <TopBar onUpgrade={() => setUpgradeOpen(true)} />
      <main className="relative z-10 max-w-6xl mx-auto px-4 py-4 sm:p-6 grid gap-6 pb-16">
        <header>
          <div className="text-[10px] uppercase tracking-[0.4em] text-fg-dim">
            Naval Alliances
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold title-grad">Clans</h1>
          <p className="text-sm text-fg-dim mt-1 max-w-2xl">
            Form a fleet, run weekly missions together, and shake down rival
            clans for +20% coin bonuses on PvP wins.
          </p>
        </header>

        {!cloudEnabled && (
          <div className="glass rounded-2xl p-4 text-sm text-fg-dim">
            Clans require cloud sync. Set Supabase env vars to enable.
          </div>
        )}

        {cloudEnabled && !username && (
          <div className="glass rounded-2xl p-4 text-sm text-fg-dim">
            Sign in to create or join a clan.{" "}
            <Link href="/auth" className="text-accent underline">Sign in →</Link>
          </div>
        )}

        {myClan && (
          <div className="glass neon-border rounded-3xl p-5 grid gap-3">
            <div className="text-[10px] uppercase tracking-[0.4em] text-fg-dim">
              Your clan
            </div>
            <div className="flex items-center gap-4 flex-wrap">
              <div
                className="text-4xl"
                style={{ color: myClan.clan.color, textShadow: `0 0 12px ${myClan.clan.color}` }}
              >
                {myClan.clan.emblem}
              </div>
              <div>
                <div className="text-xl font-extrabold">{myClan.clan.name}</div>
                <div className="text-xs text-fg-dim">
                  [{myClan.clan.tag}] · {myClan.clan.total_wins} wins · ⚓ {myClan.clan.bank_coins} bank
                </div>
              </div>
              <div className="ml-auto flex gap-2">
                <Link
                  href={`/clans/${myClan.clan.id}`}
                  className="neon-btn rounded-xl px-4 py-2 text-sm font-semibold"
                >
                  Open clan →
                </Link>
                <button
                  onClick={handleLeave}
                  className="rounded-xl px-3 py-2 border border-white/15 hover:bg-white/5 text-sm"
                >
                  Leave
                </button>
              </div>
            </div>
          </div>
        )}

        {cloudEnabled && username && !myClan && (
          <CreateClanCard
            creating={creating}
            error={createError}
            onCreate={async (name, tag, emblem, color, description) => {
              setCreateError(null);
              setCreating(true);
              const res = await createClan({
                name,
                tag,
                emblem,
                color,
                description,
                leaderUsername: username,
              });
              setCreating(false);
              if (!res.ok) {
                setCreateError(res.error ?? "Could not create clan.");
                return;
              }
              if (res.clan) router.push(`/clans/${res.clan.id}`);
            }}
          />
        )}

        <section className="glass rounded-3xl p-5 grid gap-3">
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <h2 className="text-xl font-bold neon-text">Find a clan</h2>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or tag…"
              className="neon-input pl-3"
              style={{ minWidth: 220, maxWidth: 320 }}
            />
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            {results.length === 0 && !loading && (
              <div className="text-sm text-fg-dim">No clans match.</div>
            )}
            {results.map((c) => (
              <ClanCard
                key={c.id}
                clan={c}
                canJoin={!!username && !myClan}
                onJoin={() => handleJoin(c.id)}
              />
            ))}
          </div>
        </section>

        <section className="glass rounded-3xl p-5 grid gap-3">
          <h2 className="text-xl font-bold neon-text">⚑ Clan Leaderboard</h2>
          <div className="text-xs text-fg-dim">Top clans sorted by total wins.</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[420px]">
              <thead className="text-xs uppercase tracking-wider text-fg-dim">
                <tr>
                  <th className="text-left py-2 pr-2">#</th>
                  <th className="text-left py-2 pr-2">Clan</th>
                  <th className="text-left py-2 pr-2">Tag</th>
                  <th className="text-right py-2 pr-2">Wins</th>
                  <th className="text-right py-2">Bank</th>
                </tr>
              </thead>
              <tbody>
                {topClans.map((c, i) => (
                  <motion.tr
                    key={c.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i * 0.02, 0.4) }}
                    className="border-t border-white/5"
                  >
                    <td className="py-2 pr-2 font-mono text-fg-dim tabular-nums">{i + 1}</td>
                    <td className="py-2 pr-2 font-semibold">
                      <Link href={`/clans/${c.id}`} className="hover:text-accent inline-flex items-center gap-2">
                        {i < 3 && <span>{["🥇", "🥈", "🥉"][i]}</span>}
                        <span style={{ color: c.color, textShadow: `0 0 6px ${c.color}` }}>{c.emblem}</span>
                        {c.name}
                      </Link>
                    </td>
                    <td className="py-2 pr-2 font-mono">[{c.tag}]</td>
                    <td className="py-2 pr-2 text-right tabular-nums">{c.total_wins}</td>
                    <td className="py-2 text-right tabular-nums text-amber-300">⚓ {c.bank_coins}</td>
                  </motion.tr>
                ))}
                {topClans.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center py-6 text-fg-dim">
                      No clans yet. Be the first.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <div className="text-center">
          <Link href="/" className="text-sm text-fg-dim hover:text-fg underline-offset-2 hover:underline">
            ← Back to deck
          </Link>
        </div>
      </main>
      <SiteFooter />
      <UpgradeModal open={upgradeOpen} onClose={() => setUpgradeOpen(false)} />
    </div>
  );
}

function ClanCard({
  clan,
  canJoin,
  onJoin,
}: {
  clan: ClanRow;
  canJoin: boolean;
  onJoin: () => void;
}) {
  return (
    <motion.div
      whileHover={{ y: -2 }}
      className="glass rounded-2xl p-4 flex items-center gap-3 border border-white/10"
    >
      <div
        className="text-3xl shrink-0"
        style={{ color: clan.color, textShadow: `0 0 10px ${clan.color}` }}
      >
        {clan.emblem}
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-bold truncate">{clan.name}</div>
        <div className="text-xs text-fg-dim">
          [{clan.tag}] · {clan.total_wins} wins
        </div>
        {clan.description && (
          <div className="text-xs text-fg-dim mt-1 truncate">{clan.description}</div>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Link
          href={`/clans/${clan.id}`}
          className="rounded-lg px-3 py-1.5 text-xs font-semibold border border-white/15 hover:bg-white/5"
        >
          View
        </Link>
        {canJoin && (
          <button
            onClick={onJoin}
            className="rounded-lg px-3 py-1.5 text-xs font-semibold neon-btn"
          >
            Join
          </button>
        )}
      </div>
    </motion.div>
  );
}

function CreateClanCard({
  creating,
  error,
  onCreate,
}: {
  creating: boolean;
  error: string | null;
  onCreate: (
    name: string,
    tag: string,
    emblem: string,
    color: string,
    description: string
  ) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [tag, setTag] = useState("");
  const [emblem, setEmblem] = useState("⚓");
  const [color, setColor] = useState("#00f0ff");
  const [description, setDescription] = useState("");

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="glass neon-border rounded-3xl p-5 text-left hover:translate-y-[-2px] transition-transform"
      >
        <div className="text-[10px] uppercase tracking-[0.4em] text-fg-dim">
          Found a clan
        </div>
        <div className="text-2xl font-extrabold neon-text">⚑ Create a new clan</div>
        <div className="text-sm text-fg-dim mt-1">
          Pick a name, tag, color, and emblem. You become the leader automatically.
        </div>
      </button>
    );
  }

  return (
    <div className="glass neon-border rounded-3xl p-5 grid gap-3">
      <div className="text-2xl font-extrabold neon-text">⚑ Create a clan</div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] uppercase tracking-[0.3em] text-fg-dim">
            Clan name
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="The Neon Armada"
            maxLength={32}
            className="neon-input pl-3 mt-1"
          />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-[0.3em] text-fg-dim">
            Tag (2–4 chars)
          </label>
          <input
            value={tag}
            onChange={(e) => setTag(e.target.value.toUpperCase().slice(0, 4))}
            placeholder="NEON"
            maxLength={4}
            className="neon-input pl-3 mt-1 font-mono tracking-[0.2em]"
          />
        </div>
      </div>

      <div>
        <label className="text-[10px] uppercase tracking-[0.3em] text-fg-dim">
          Emblem
        </label>
        <div className="flex gap-2 flex-wrap mt-1">
          {EMBLEMS.map((e) => (
            <button
              key={e}
              onClick={() => setEmblem(e)}
              className={`text-2xl rounded-lg w-10 h-10 grid place-items-center border ${
                emblem === e ? "border-accent bg-accent/10" : "border-white/15"
              }`}
              type="button"
            >
              {e}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-[10px] uppercase tracking-[0.3em] text-fg-dim">
          Color
        </label>
        <div className="flex gap-2 flex-wrap mt-1">
          {COLOR_PRESETS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={`w-9 h-9 rounded-lg border ${
                color === c ? "ring-2 ring-white" : "border-white/15"
              }`}
              style={{ background: c }}
              type="button"
            />
          ))}
        </div>
      </div>

      <div>
        <label className="text-[10px] uppercase tracking-[0.3em] text-fg-dim">
          Description (optional)
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value.slice(0, 200))}
          placeholder="Hunters of the deep neon."
          rows={2}
          className="w-full mt-1 rounded-xl bg-black/40 border border-white/15 px-3 py-2 text-sm"
        />
      </div>

      {error && (
        <div className="neon-error rounded-xl px-3 py-2 text-sm">{error}</div>
      )}

      <div className="flex gap-2 justify-end">
        <button
          onClick={() => setOpen(false)}
          className="rounded-xl px-4 py-2 border border-white/15 hover:bg-white/5"
        >
          Cancel
        </button>
        <button
          disabled={creating}
          onClick={() => onCreate(name, tag, emblem, color, description)}
          className="neon-btn rounded-xl px-5 py-2 font-semibold disabled:opacity-50"
        >
          {creating ? "Creating…" : "Create clan"}
        </button>
      </div>
    </div>
  );
}
