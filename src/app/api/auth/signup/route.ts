import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import type { NextRequest } from "next/server";

// Force the Node runtime so process.env access is unambiguous and the
// service-role key never leaks into Edge bundles.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const USERNAME_RE = /^[a-z0-9_]{3,20}$/i;
const PASSWORD_MIN = 6;
const PASSWORD_MAX = 200;

// Random synthetic address — never shown to the user, never used to send
// mail. Random per signup so each account has its own address and the
// per-address rate limit can't bite. crypto.randomBytes (not Math.random)
// so the suffix isn't guessable.
function makeSyntheticEmail(username: string): string {
  return `bs${username.toLowerCase()}${randomBytes(3).toString("hex")}@gmail.com`;
}

// Best-effort per-IP rate limit. In-memory only — fine for the single
// Node process this route runs in; replace with Redis/Upstash if the app
// is ever fronted by multiple instances.
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 8;
const ipHits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const fresh = (ipHits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  fresh.push(now);
  ipHits.set(ip, fresh);
  // Periodic cleanup so the map can't grow forever under attack.
  if (ipHits.size > 5000) {
    for (const [k, v] of ipHits) {
      if (v.every((t) => now - t >= RATE_WINDOW_MS)) ipHits.delete(k);
    }
  }
  return fresh.length > RATE_MAX;
}

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

function sameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

const noStore = { "Cache-Control": "no-store" } as const;

function json(body: unknown, status: number) {
  return Response.json(body, { status, headers: noStore });
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return json({ error: "Forbidden." }, 403);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return json({ error: "Server misconfigured." }, 500);
  }

  const ip = clientIp(request);
  if (rateLimited(ip)) {
    return json({ error: "Too many requests." }, 429);
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }
  if (!raw || typeof raw !== "object") {
    return json({ error: "Invalid body." }, 400);
  }

  const { username, password } = raw as { username?: unknown; password?: unknown };
  if (typeof username !== "string" || typeof password !== "string") {
    return json({ error: "Invalid input." }, 400);
  }
  const name = username.trim();
  if (!USERNAME_RE.test(name)) {
    return json({ error: "Invalid username." }, 400);
  }
  if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
    return json({ error: "Invalid password." }, 400);
  }

  // Server-only client. The service-role key bypasses RLS, so we never
  // want this instance reachable from a request scope that mixes user
  // data — a fresh client per request keeps it isolated.
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const usernameLc = name.toLowerCase();

  // Sweep orphans from the legacy @internal.battleship flow before the
  // uniqueness check — those rows occupy username_lc without a usable
  // auth.users row and produce false-positive "taken" errors.
  await admin
    .from("profiles")
    .delete()
    .like("auth_email", "%@internal.battleship%");

  const { count, error: countErr } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("username_lc", usernameLc);
  if (countErr) {
    return json({ error: "Lookup failed." }, 500);
  }
  if ((count ?? 0) > 0) {
    return json({ error: "Username already taken." }, 409);
  }

  const email = makeSyntheticEmail(name);

  const { data: createData, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createErr || !createData?.user) {
    const taken = /already|registered|exists/i.test(createErr?.message ?? "");
    return json({ error: taken ? "Username already taken." : "Sign up failed." }, 400);
  }

  const userId = createData.user.id;

  const { error: upsertErr } = await admin.from("profiles").upsert(
    {
      id: userId,
      username: name,
      username_lc: usernameLc,
      auth_email: email,
    },
    { onConflict: "id" },
  );
  if (upsertErr) {
    // Roll back the auth.users row so a failed profile insert doesn't
    // strand an account that the user can never reach.
    await admin.auth.admin.deleteUser(userId);
    return json({ error: "Profile create failed." }, 500);
  }

  return json({ userId, email }, 201);
}
