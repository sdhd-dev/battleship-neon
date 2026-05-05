"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { TopBar } from "@/components/TopBar";
import { UpgradeModal } from "@/components/UpgradeModal";
import { useAuth } from "@/components/AuthProvider";
import {
  ClanChatRow,
  ClanMemberRow,
  ClanMissionRow,
  ClanRow,
  ClanWarRow,
  MIN_CLAN_DONATION,
  distributeBank,
  donateToClan,
  ensureWeeklyMission,
  fetchClanById,
  fetchClanChat,
  fetchClanMembers,
  fetchClanMissions,
  fetchClanWar,
  fetchTopWeeklyDonor,
  getMyClan,
  leaveClan,
  sendBankToMember,
  sendClanChat,
  withdrawFromBank,
} from "@/lib/clans";
import { getSupabase, supabaseEnabled } from "@/lib/supabase/client";
import { notify } from "@/lib/notify";

export default function ClanProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { username, profile, cloudEnabled } = useAuth();
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  const [clan, setClan] = useState<ClanRow | null>(null);
  const [members, setMembers] = useState<ClanMemberRow[]>([]);
  const [missions, setMissions] = useState<ClanMissionRow[]>([]);
  const [war, setWar] = useState<{ war: ClanWarRow; opponent: ClanRow | null } | null>(null);
  const [chat, setChat] = useState<ClanChatRow[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [donateAmount, setDonateAmount] = useState<number>(MIN_CLAN_DONATION);
  const [distAmount, setDistAmount] = useState<number>(10);
  const [withdrawAmount, setWithdrawAmount] = useState<number>(50);
  const [memberSendAmount, setMemberSendAmount] = useState<number>(50);
  const [memberSendTarget, setMemberSendTarget] = useState<string>("");
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [myClanId, setMyClanId] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<string | null>(null);
  const [topDonor, setTopDonor] = useState<{
    user_id: string;
    username: string;
    total: number;
  } | null>(null);

  const channelRef = useRef<RealtimeChannel | null>(null);

  const refresh = useCallback(async () => {
    if (!cloudEnabled) return;
    const c = await fetchClanById(id);
    if (!c) {
      setClan(null);
      return;
    }
    setClan(c);
    await ensureWeeklyMission(id);
    const [m, ms, w, ch, mine, top] = await Promise.all([
      fetchClanMembers(id),
      fetchClanMissions(id),
      fetchClanWar(id),
      fetchClanChat(id),
      getMyClan(),
      fetchTopWeeklyDonor(id),
    ]);
    setMembers(m);
    setMissions(ms);
    setWar(w);
    setChat(ch);
    setMyClanId(mine?.clan.id ?? null);
    setMyRole(mine?.member.role ?? null);
    setTopDonor(top);
  }, [cloudEnabled, id]);

  useEffect(() => {
    // refresh awaits cloud calls before any setState, so the writes
    // are not synchronous to this effect — disable to silence the
    // structural lint that can't see across the await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  const isMember = myClanId === id;
  const canManageBank = isMember && (myRole === "leader" || myRole === "officer");

  // Realtime subscriptions for chat, members, mission progress.
  useEffect(() => {
    if (!supabaseEnabled() || !clan) return;
    const sb = getSupabase();
    if (!sb) return;

    const channel = sb.channel(`clan:${clan.id}`);
    channelRef.current = channel;

    channel.on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "clan_chat", filter: `clan_id=eq.${clan.id}` },
      (payload) => {
        const row = payload.new as ClanChatRow;
        setChat((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
      }
    );
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "clan_members", filter: `clan_id=eq.${clan.id}` },
      () => {
        fetchClanMembers(clan.id).then(setMembers);
      }
    );
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "clan_missions", filter: `clan_id=eq.${clan.id}` },
      () => {
        fetchClanMissions(clan.id).then(setMissions);
      }
    );
    channel.on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "clans", filter: `id=eq.${clan.id}` },
      (payload) => {
        setClan(payload.new as ClanRow);
      }
    );

    channel.subscribe();
    return () => {
      channel.unsubscribe();
      channelRef.current = null;
    };
  }, [clan]);

  const sendChat = async () => {
    if (!chatInput.trim() || !clan || !username) return;
    const text = chatInput;
    setChatInput("");
    await sendClanChat(clan.id, username, text);
  };

  const handleDonate = async () => {
    setActionMsg(null);
    if (donateAmount < MIN_CLAN_DONATION) {
      setActionMsg(`Minimum donation is ${MIN_CLAN_DONATION} coins.`);
      return;
    }
    if ((profile.coins ?? 0) < donateAmount) {
      const msg = "Not enough coins to donate that much.";
      notify(msg, "error");
      setActionMsg(msg);
      return;
    }
    const res = await donateToClan(donateAmount);
    if (!res.ok) {
      // donateToClan already raised a toast; mirror in inline status too.
      setActionMsg(res.error ?? "Donation failed.");
      return;
    }
    setActionMsg(`Donated ⚓ ${donateAmount.toLocaleString()} to the clan bank.`);
    await refresh();
  };

  const handleDistribute = async () => {
    setActionMsg(null);
    const res = await distributeBank(distAmount);
    if (!res.ok) {
      setActionMsg(res.error ?? "Distribution failed.");
      return;
    }
    setActionMsg(
      `Paid ⚓ ${res.perMember} to ${res.members} members from the clan bank.`
    );
    await refresh();
  };

  const handleWithdraw = async () => {
    setActionMsg(null);
    const res = await withdrawFromBank(withdrawAmount);
    if (!res.ok) {
      notify(res.error ?? "Withdraw failed.", "error");
      setActionMsg(res.error ?? "Withdraw failed.");
      return;
    }
    setActionMsg(
      `Withdrew ⚓ ${withdrawAmount.toLocaleString()} from the bank to your balance.`
    );
    await refresh();
  };

  const handleSendToMember = async () => {
    setActionMsg(null);
    if (!memberSendTarget) {
      setActionMsg("Pick a member to send coins to.");
      return;
    }
    const res = await sendBankToMember(memberSendTarget, memberSendAmount);
    if (!res.ok) {
      notify(res.error ?? "Send failed.", "error");
      setActionMsg(res.error ?? "Send failed.");
      return;
    }
    const target = members.find((m) => m.user_id === memberSendTarget);
    setActionMsg(
      `Sent ⚓ ${memberSendAmount.toLocaleString()} to ${target?.username ?? "member"}.`
    );
    await refresh();
  };

  const handleLeave = async () => {
    if (!confirm("Leave this clan?")) return;
    const res = await leaveClan();
    if (!res.ok) {
      notify(res.error ?? "Could not leave.");
      return;
    }
    router.push("/clans");
  };

  if (!cloudEnabled) {
    return (
      <Shell upgradeOpen={upgradeOpen} setUpgradeOpen={setUpgradeOpen}>
        <div className="glass rounded-3xl p-6 text-center text-fg-dim">
          Clans require cloud sync.
        </div>
      </Shell>
    );
  }

  if (!clan) {
    return (
      <Shell upgradeOpen={upgradeOpen} setUpgradeOpen={setUpgradeOpen}>
        <div className="glass rounded-3xl p-6 text-center text-fg-dim">
          Clan not found.{" "}
          <Link href="/clans" className="text-accent underline">
            Back to clans
          </Link>
        </div>
      </Shell>
    );
  }

  return (
    <Shell upgradeOpen={upgradeOpen} setUpgradeOpen={setUpgradeOpen}>
      <header className="glass neon-border rounded-3xl p-5 grid gap-3">
        <div className="flex items-center gap-4 flex-wrap">
          <div
            className="text-5xl shrink-0"
            style={{ color: clan.color, textShadow: `0 0 16px ${clan.color}` }}
          >
            {clan.emblem}
          </div>
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.4em] text-fg-dim">
              Clan · [{clan.tag}]
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold" style={{ color: clan.color }}>
              {clan.name}
            </h1>
            <p className="text-sm text-fg-dim mt-1">
              {clan.description || <em className="text-fg-dim/70">No description set.</em>}
            </p>
          </div>
          <div className="ml-auto flex gap-2">
            {isMember && (
              <button
                onClick={handleLeave}
                className="rounded-xl px-3 py-2 border border-white/15 hover:bg-white/5 text-sm"
              >
                Leave clan
              </button>
            )}
            <Link
              href="/clans"
              className="rounded-xl px-3 py-2 border border-white/15 hover:bg-white/5 text-sm"
            >
              All clans
            </Link>
          </div>
        </div>
        <div className="grid sm:grid-cols-4 gap-2">
          <Stat label="Total wins" value={clan.total_wins.toString()} />
          <Stat label="Members" value={members.length.toString()} />
          <Stat label="Bank" value={`⚓ ${clan.bank_coins.toLocaleString()}`} />
          <Stat
            label="Founded"
            value={new Date(clan.created_at).toLocaleDateString()}
          />
        </div>
      </header>

      <div className="grid lg:grid-cols-[1fr_380px] gap-6 items-start">
        <div className="grid gap-6 min-w-0">
          <section className="glass rounded-3xl p-5 grid gap-3">
            <h2 className="text-xl font-bold neon-text">Members</h2>
            <div className="grid gap-2">
              {members.map((m) => (
                <div
                  key={m.user_id}
                  className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2"
                >
                  <span
                    className="w-7 h-7 rounded-full bg-gradient-to-br from-accent-3 to-accent-2 grid place-items-center text-xs font-bold shrink-0"
                  >
                    {m.username[0]?.toUpperCase() ?? "?"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate flex items-center gap-2 flex-wrap">
                      <span className="truncate">{m.username}</span>
                      {profile.username === m.username && (
                        <span className="text-[10px] uppercase tracking-wider text-accent">
                          You
                        </span>
                      )}
                      {topDonor && topDonor.user_id === m.user_id && (
                        <span
                          className="text-[10px] uppercase tracking-wider rounded-full px-2 py-[2px] border border-amber-300/40 bg-amber-300/10 text-amber-200"
                          title={`Donated ⚓ ${topDonor.total.toLocaleString()} this week`}
                        >
                          🏆 Top donor
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-fg-dim">
                      {m.role === "leader"
                        ? "👑 Leader"
                        : m.role === "officer"
                          ? "⭐ Officer"
                          : "Member"}
                      {" · "}joined{" "}
                      {new Date(m.joined_at).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="text-right text-xs text-fg-dim tabular-nums">
                    ⚓ {m.contributed_coins.toLocaleString()}
                  </div>
                </div>
              ))}
              {members.length === 0 && (
                <div className="text-sm text-fg-dim">No members yet.</div>
              )}
            </div>
          </section>

          <section className="glass rounded-3xl p-5 grid gap-3">
            <h2 className="text-xl font-bold neon-text">📜 Weekly Missions</h2>
            <div className="text-xs text-fg-dim">
              Progress is shared by the whole clan. Completing a mission rewards
              the clan bank.
            </div>
            <div className="grid gap-3">
              {missions.length === 0 && (
                <div className="text-sm text-fg-dim">
                  No active missions for this week.
                </div>
              )}
              {missions.map((m) => {
                const pct = Math.min(100, Math.round((m.progress / m.target) * 100));
                return (
                  <div key={m.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-bold">
                          {missionLabel(m.mission_type, m.target)}
                        </div>
                        <div className="text-[11px] text-fg-dim">
                          Reward: ⚓ {m.reward_coins} to clan bank
                        </div>
                      </div>
                      <div className="text-sm font-mono tabular-nums">
                        {m.progress} / {m.target}
                      </div>
                    </div>
                    <div className="mt-2 h-2 rounded-full bg-white/10 overflow-hidden">
                      <motion.div
                        className="h-full"
                        animate={{ width: `${pct}%` }}
                        style={{
                          background:
                            "linear-gradient(90deg, var(--accent), var(--accent-2))",
                          boxShadow: "0 0 10px var(--accent)",
                        }}
                      />
                    </div>
                    {m.completed && (
                      <div className="mt-2 text-xs text-accent font-bold">
                        ✓ Completed — bank credited
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <section className="glass rounded-3xl p-5 grid gap-3">
            <h2 className="text-xl font-bold neon-text">⚔ Weekly War</h2>
            {!war ? (
              <div className="text-sm text-fg-dim">
                No active war this week. Top winning clan earns an exclusive
                emblem.
              </div>
            ) : (
              <div className="grid sm:grid-cols-[1fr_auto_1fr] gap-3 items-center">
                <WarSide clan={clan} score={war.war.clan1_id === clan.id ? war.war.clan1_score : war.war.clan2_score} />
                <div className="text-center text-xs uppercase tracking-[0.3em] text-fg-dim">vs</div>
                <WarSide
                  clan={war.opponent}
                  score={war.war.clan1_id === clan.id ? war.war.clan2_score : war.war.clan1_score}
                />
              </div>
            )}
          </section>

          <section className="glass rounded-3xl p-5 grid gap-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h2 className="text-xl font-bold neon-text">🏦 Clan Bank</h2>
              <div
                className="text-lg font-extrabold tabular-nums"
                style={{ color: clan.color, textShadow: `0 0 10px ${clan.color}` }}
              >
                ⚓ {clan.bank_coins.toLocaleString()} coins
              </div>
            </div>
            <div className="text-xs text-fg-dim">
              Members donate coins to grow the bank. Leaders and officers
              distribute them back as rewards for clan-mission grinding.
            </div>

            {isMember ? (
              <div className="rounded-xl border border-white/10 bg-black/20 p-3 grid gap-2">
                <div className="text-[10px] uppercase tracking-[0.3em] text-fg-dim">
                  Donate
                </div>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min={MIN_CLAN_DONATION}
                    value={donateAmount}
                    onChange={(e) =>
                      setDonateAmount(Math.max(0, +e.target.value || 0))
                    }
                    className="flex-1 rounded-lg bg-black/40 border border-white/15 px-3 py-2 text-sm tabular-nums"
                  />
                  <button
                    onClick={handleDonate}
                    disabled={
                      donateAmount < MIN_CLAN_DONATION ||
                      (profile.coins ?? 0) < donateAmount
                    }
                    className="neon-btn rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Donate ⚓
                  </button>
                </div>
                <div className="text-[11px] text-fg-dim">
                  You have ⚓ {(profile.coins ?? 0).toLocaleString()} ·
                  minimum donation ⚓ {MIN_CLAN_DONATION}
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-fg-dim">
                Join this clan to donate to its bank.
              </div>
            )}

            {canManageBank && (() => {
              const memberCount = Math.max(1, members.length);
              const maxPerMember = Math.floor(clan.bank_coins / memberCount);
              const bankEmpty = clan.bank_coins <= 0;
              const distributeDisabled =
                bankEmpty ||
                distAmount < 1 ||
                distAmount > maxPerMember;
              const withdrawDisabled =
                bankEmpty ||
                withdrawAmount < 1 ||
                withdrawAmount > clan.bank_coins;
              const sendDisabled =
                bankEmpty ||
                !memberSendTarget ||
                memberSendAmount < 1 ||
                memberSendAmount > clan.bank_coins;
              return (
                <div className="rounded-2xl border border-amber-300/30 bg-amber-300/5 p-3 sm:p-4 grid gap-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="text-[10px] uppercase tracking-[0.3em] text-amber-200">
                    Clan Treasury · {myRole === "leader" ? "Leader" : "Officer"}
                  </div>
                  <div className="text-[11px] text-fg-dim">
                    Bank ⚓ {clan.bank_coins.toLocaleString()}
                  </div>
                </div>

                <div className="flex flex-col md:flex-row gap-3">
                  <div className="flex-1 min-w-0 rounded-xl border border-white/10 bg-black/30 p-3 grid gap-2">
                    <div className="text-[10px] uppercase tracking-[0.3em] text-fg-dim">
                      Distribute to all
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        min={1}
                        max={maxPerMember || undefined}
                        value={distAmount}
                        onChange={(e) =>
                          setDistAmount(Math.max(1, +e.target.value || 0))
                        }
                        className="flex-1 min-w-0 rounded-lg bg-black/40 border border-white/15 px-3 py-2 text-sm tabular-nums"
                      />
                      <button
                        onClick={handleDistribute}
                        disabled={distributeDisabled}
                        className="neon-btn rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Pay each
                      </button>
                    </div>
                    <div className="text-[11px] text-fg-dim">
                      ⚓ {distAmount} × {members.length} members = ⚓{" "}
                      {(distAmount * members.length).toLocaleString()}
                      {maxPerMember > 0 && (
                        <span className="block">Max ⚓ {maxPerMember.toLocaleString()} / member</span>
                      )}
                    </div>
                  </div>

                  <div className="flex-1 min-w-0 rounded-xl border border-white/10 bg-black/30 p-3 grid gap-2">
                    <div className="text-[10px] uppercase tracking-[0.3em] text-fg-dim">
                      Withdraw to me
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        min={1}
                        max={clan.bank_coins || undefined}
                        value={withdrawAmount}
                        onChange={(e) =>
                          setWithdrawAmount(Math.max(1, +e.target.value || 0))
                        }
                        className="flex-1 min-w-0 rounded-lg bg-black/40 border border-white/15 px-3 py-2 text-sm tabular-nums"
                      />
                      <button
                        onClick={handleWithdraw}
                        disabled={withdrawDisabled}
                        className="neon-btn rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Withdraw
                      </button>
                    </div>
                    <div className="text-[11px] text-fg-dim">
                      Sends bank coins to your own balance.
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-black/30 p-3 grid gap-2">
                  <div className="text-[10px] uppercase tracking-[0.3em] text-fg-dim">
                    Distribute to member
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <select
                      value={memberSendTarget}
                      onChange={(e) => setMemberSendTarget(e.target.value)}
                      className="flex-1 min-w-0 rounded-lg bg-black/40 border border-white/15 px-3 py-2 text-sm"
                    >
                      <option value="">Pick member…</option>
                      {members.map((m) => (
                        <option key={m.user_id} value={m.user_id}>
                          {m.username}
                          {m.role !== "member" ? ` · ${m.role}` : ""}
                        </option>
                      ))}
                    </select>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        min={1}
                        max={clan.bank_coins || undefined}
                        value={memberSendAmount}
                        onChange={(e) =>
                          setMemberSendAmount(Math.max(1, +e.target.value || 0))
                        }
                        className="flex-1 sm:w-32 sm:flex-none min-w-0 rounded-lg bg-black/40 border border-white/15 px-3 py-2 text-sm tabular-nums"
                      />
                      <button
                        onClick={handleSendToMember}
                        disabled={sendDisabled}
                        className="neon-btn rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                      >
                        Send ⚓
                      </button>
                    </div>
                  </div>
                  <div className="text-[11px] text-fg-dim">
                    Pay a single member from the bank — useful for rewarding
                    individual contributions.
                  </div>
                </div>
                </div>
              );
            })()}

            {actionMsg && (
              <div className="rounded-xl px-3 py-2 text-xs text-fg-dim border border-white/10 bg-black/30">
                {actionMsg}
              </div>
            )}
          </section>
        </div>

        <aside className="lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100vh-2rem)]">
          <section className="glass rounded-3xl p-4 flex flex-col h-[600px]">
            <h3 className="text-lg font-bold neon-text">💬 Clan Chat</h3>
            <div className="flex-1 mt-2 overflow-y-auto pr-1 space-y-2">
              {chat.length === 0 && (
                <div className="text-sm text-fg-dim text-center mt-6">
                  Be the first to post.
                </div>
              )}
              {chat.map((m) => (
                <div key={m.id} className="rounded-lg bg-black/20 border border-white/5 px-3 py-2">
                  <div className="flex items-center gap-2 text-[11px] text-fg-dim">
                    <span className="font-bold text-accent">{m.username}</span>
                    <span>·</span>
                    <span>{new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                  <div className="text-sm mt-1 break-words">{m.text}</div>
                </div>
              ))}
            </div>
            {isMember ? (
              <div className="flex gap-2 mt-2">
                <input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void sendChat();
                  }}
                  maxLength={240}
                  placeholder="Message…"
                  className="flex-1 rounded-lg bg-black/40 border border-white/15 px-3 py-2 text-sm"
                />
                <button onClick={sendChat} className="neon-btn rounded-lg px-4 py-2 text-sm font-semibold">
                  Send
                </button>
              </div>
            ) : (
              <div className="mt-2 text-[11px] text-fg-dim text-center">
                Join this clan to chat.
              </div>
            )}
          </section>
        </aside>
      </div>
    </Shell>
  );
}

function Shell({
  children,
  upgradeOpen,
  setUpgradeOpen,
}: {
  children: React.ReactNode;
  upgradeOpen: boolean;
  setUpgradeOpen: (b: boolean) => void;
}) {
  return (
    <div className="bg-field min-h-screen">
      <TopBar onUpgrade={() => setUpgradeOpen(true)} />
      <main className="relative z-10 max-w-6xl mx-auto p-4 sm:p-6 grid gap-6 pb-16">
        {children}
      </main>
      <UpgradeModal open={upgradeOpen} onClose={() => setUpgradeOpen(false)} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.3em] text-fg-dim">{label}</div>
      <div className="font-bold text-sm">{value}</div>
    </div>
  );
}

function WarSide({ clan, score }: { clan: ClanRow | null; score: number }) {
  if (!clan) {
    return (
      <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-center text-fg-dim text-sm">
        Awaiting opponent
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-center">
      <div className="text-3xl" style={{ color: clan.color, textShadow: `0 0 10px ${clan.color}` }}>
        {clan.emblem}
      </div>
      <div className="font-bold mt-1 truncate">{clan.name}</div>
      <div className="text-[10px] text-fg-dim">[{clan.tag}]</div>
      <div className="mt-2 text-3xl font-extrabold tabular-nums" style={{ color: clan.color }}>
        {score}
      </div>
    </div>
  );
}

function missionLabel(type: string, target: number): string {
  switch (type) {
    case "wins":
      return `Win ${target} games as a clan`;
    case "shots_hit":
      return `Land ${target} hits as a clan`;
    default:
      return `${type}: ${target}`;
  }
}
