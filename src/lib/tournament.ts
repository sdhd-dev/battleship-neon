// Weekly tournament window math. All boundaries in UTC so the reset
// happens at the same wall-clock instant for every player.

export function currentWeekStart(now: Date = new Date()): Date {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = d.getUTCDay(); // Sun=0..Sat=6
  const diff = (day + 6) % 7; // days since Monday
  d.setUTCDate(d.getUTCDate() - diff);
  return d;
}

export function nextWeekStart(now: Date = new Date()): Date {
  const cur = currentWeekStart(now);
  const next = new Date(cur);
  next.setUTCDate(next.getUTCDate() + 7);
  return next;
}

// "YYYY-MM-DD" in UTC.
export function weekStartIso(d: Date = new Date()): string {
  return currentWeekStart(d).toISOString().slice(0, 10);
}

export function msUntilNextReset(now: Date = new Date()): number {
  return Math.max(0, nextWeekStart(now).getTime() - now.getTime());
}

export function formatCountdown(ms: number): string {
  if (ms <= 0) return "0d 00:00:00";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d}d ${pad(h)}:${pad(m)}:${pad(sec)}`;
}
