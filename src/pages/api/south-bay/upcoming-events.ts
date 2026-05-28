import type { APIRoute } from "astro";
import upcomingData from "../../../data/south-bay/upcoming-events.json";

// Prerender this route so it becomes a static file at build time — that lets
// the homepage + city + tab views fetch the full event feed without bundling
// the JSON into their client JS. The build output ships the JSON as a sibling
// asset that the browser can cache independently of the app bundle.
//
// We trim two things from the served copy (the on-disk file stays full for
// plan-day + other server consumers): events that are already in the past
// (with a 1-day grace so paging back doesn't hit an empty day), and the
// server-only `audienceAge` field (used for kids-mode filtering server-side,
// never read by any client component). Clients read `.events` only.
export const prerender = true;

const all = upcomingData as { generatedAt?: string; events?: Record<string, unknown>[] };

// PT "today" minus a one-day grace, computed at build time. The site
// redeploys nightly with fresh data, so this stays current.
function ptCutoff(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
}

export const GET: APIRoute = () => {
  const cutoff = ptCutoff();
  const events = (all.events ?? [])
    .filter((e) => {
      const date = e?.date;
      return typeof date !== "string" || date.slice(0, 10) >= cutoff;
    })
    .map((e) => {
      const trimmed = { ...e };
      delete trimmed.audienceAge;
      return trimmed;
    });

  const payload = { generatedAt: all.generatedAt, eventCount: events.length, events };

  return new Response(JSON.stringify(payload), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=86400",
    },
  });
};
