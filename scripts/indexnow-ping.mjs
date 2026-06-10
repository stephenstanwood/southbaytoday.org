#!/usr/bin/env node
// Ping IndexNow (Bing/Yandex/Seznam/Naver) with the URLs that change daily —
// the freshness surface, not the whole sitemap. Run after the nightly deploy.
// Polite by design: one POST, ~30 URLs, only pages we actually regenerated.
//
// Wiring: not yet on a schedule. Run manually or add to the Mini's nightly
// post-deploy step:  node scripts/indexnow-ping.mjs
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SITE = "https://southbaytoday.org";
const KEY = "4f3a853c500ce1bcdf3e2265af3981d6"; // public by protocol design; key file lives at /<key>.txt

const upcoming = JSON.parse(
  readFileSync(join(__dirname, "..", "src", "data", "south-bay", "upcoming-events.json"), "utf8"),
);
const digests = JSON.parse(
  readFileSync(join(__dirname, "..", "src", "data", "south-bay", "digests.json"), "utf8"),
);

const todayPt = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
const dates = [...new Set(
  (upcoming.events ?? [])
    .filter((e) => e?.date && e?.time && e.date >= todayPt)
    .map((e) => e.date),
)].sort().slice(0, 14);

const urls = [
  `${SITE}/`,
  `${SITE}/events`,
  `${SITE}/gov`,
  `${SITE}/food`,
  `${SITE}/food/new`,
  `${SITE}/rss.xml`,
  ...dates.map((d) => `${SITE}/events/${d}`),
  ...Object.keys(digests).map((c) => `${SITE}/gov/${c}`),
];

const res = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify({
    host: "southbaytoday.org",
    key: KEY,
    keyLocation: `${SITE}/${KEY}.txt`,
    urlList: urls,
  }),
});

console.log(`IndexNow: ${res.status} ${res.statusText} — ${urls.length} URLs submitted`);
if (!res.ok && res.status !== 202) {
  const body = await res.text().catch(() => "");
  console.error(body.slice(0, 300));
  process.exit(1);
}
