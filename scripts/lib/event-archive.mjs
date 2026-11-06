import { normalizeClockTime } from "./clock-time.mjs";

// Source feeds can drop a session as soon as it starts. Preserve that dated
// record before same-title collision suffixes shift to later sessions.
export function maintainEventArchive({ archiveEvents = [], previousEvents = [], currentEvents = [], now = new Date(), retainDays = 90 }) {
  const today = now.toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
  const cutoff = new Date(`${today}T12:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - retainDays);
  const cutoffDay = cutoff.toISOString().slice(0, 10);
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles", hourCycle: "h23", hour: "2-digit", minute: "2-digit",
  }).formatToParts(now).map(({ type, value }) => [type, value]));
  const minuteNow = Number(parts.hour) * 60 + Number(parts.minute);
  const key = e => e.id ?? `${e.date}|${e.title}`;
  const present = new Set(currentEvents.map(e => JSON.stringify([e.date, key(e)])));
  const startedToday = e => {
    if (e.date !== today) return false;
    const clock = /^(1[0-2]|[1-9]):([0-5]\d) (AM|PM)$/.exec(normalizeClockTime(e.time) || "");
    return Boolean(clock && (Number(clock[1]) % 12 + (clock[3] === "PM" ? 12 : 0)) * 60 + Number(clock[2]) <= minuteNow);
  };
  const aging = previousEvents.filter(e => typeof e?.date === "string" && (
    e.date < today || (startedToday(e) && !present.has(JSON.stringify([e.date, key(e)])))
  ));
  const byId = new Map(archiveEvents.map(e => [key(e), e]));
  for (const e of aging) byId.set(key(e), e);
  const events = [...byId.values()].filter(e => typeof e?.date === "string"
    && e.date >= cutoffDay && (e.date < today || startedToday(e)));
  events.sort((a, b) => a.date.localeCompare(b.date) || String(a.id ?? "").localeCompare(String(b.id ?? "")));
  return { events, agingCount: aging.length };
}
