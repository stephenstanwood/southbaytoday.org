import type { APIRoute } from "astro";
import upcomingData from "../data/south-bay/upcoming-events.json";
import { CITIES } from "../lib/south-bay/cities";
import { parseClockTime } from "../lib/south-bay/calendarLink";
import { ptOffsetForDate } from "../lib/south-bay/eventSchema";

// RSS 2.0 feed: one item per day (today + next 6), each linking its static
// /events/<date> page. Rebuilt nightly with the data, so "today" tracks the
// deploy cadence. Hand-rolled XML — the shape is small and stable enough that
// a dependency isn't worth it.
export const prerender = true;

interface FeedEvent {
  title?: string | null;
  date?: string | null;
  time?: string | null;
  venue?: string | null;
  city?: string | null;
  cost?: string | null;
}

const SITE = "https://southbaytoday.org";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function rfc822(date: string, hh: number, mm: number): string {
  // "Sat, 13 Jun 2026 06:00:00 -0700" — explicit PT offset for that date.
  const d = new Date(`${date}T12:00:00Z`);
  const wd = d.toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short" });
  const mon = d.toLocaleDateString("en-US", { timeZone: "UTC", month: "short" });
  const day = d.toLocaleDateString("en-US", { timeZone: "UTC", day: "2-digit" });
  const year = d.toLocaleDateString("en-US", { timeZone: "UTC", year: "numeric" });
  const offset = ptOffsetForDate(date).replace(":", "");
  const p2 = (n: number) => String(n).padStart(2, "0");
  return `${wd}, ${day} ${mon} ${year} ${p2(hh)}:${p2(mm)}:00 ${offset}`;
}

export const GET: APIRoute = () => {
  const cityNames = new Map<string, string>(CITIES.map((c) => [c.id as string, c.name]));
  const all = (upcomingData as { events?: FeedEvent[] }).events ?? [];

  const todayPt = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
  const horizon = new Date();
  horizon.setDate(horizon.getDate() + 6);
  const horizonPt = horizon.toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });

  const byDate = new Map<string, FeedEvent[]>();
  for (const e of all) {
    if (!e.date || !e.time || e.date < todayPt || e.date > horizonPt) continue;
    if (!byDate.has(e.date)) byDate.set(e.date, []);
    byDate.get(e.date)!.push(e);
  }

  const items = [...byDate.keys()]
    .sort()
    .map((date) => {
      const events = byDate
        .get(date)!
        .slice()
        .sort((a, b) => {
          const ta = parseClockTime(a.time);
          const tb = parseClockTime(b.time);
          return (ta ? ta.h * 60 + ta.m : 1441) - (tb ? tb.h * 60 + tb.m : 1441);
        });
      const dayLabel = new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
        timeZone: "UTC",
        weekday: "long",
        month: "long",
        day: "numeric",
      });
      const lines = events
        .slice(0, 12)
        .map((e) => {
          const where = [e.venue, e.city ? cityNames.get(e.city) : null].filter(Boolean).join(", ");
          return `<li>${esc(e.time ?? "")} — ${esc(e.title ?? "")}${where ? ` (${esc(where)})` : ""}</li>`;
        })
        .join("");
      const more = events.length > 12 ? `<p>…and ${events.length - 12} more on the full listing.</p>` : "";
      const url = `${SITE}/events/${date}`;
      return `    <item>
      <title>${esc(`${dayLabel} — ${events.length} events across the South Bay`)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <pubDate>${rfc822(date, 6, 0)}</pubDate>
      <description><![CDATA[<ul>${lines}</ul>${more}]]></description>
    </item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>The South Bay Today — Events</title>
    <link>${SITE}/events</link>
    <atom:link href="${SITE}/rss.xml" rel="self" type="application/rss+xml" />
    <description>Day-by-day event listings across Campbell, Los Gatos, Mountain View, San Jose, Palo Alto, and more South Bay cities.</description>
    <language>en-us</language>
    <lastBuildDate>${rfc822(todayPt, 6, 0)}</lastBuildDate>
${items}
  </channel>
</rss>
`;

  return new Response(xml, {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
};
