import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const site = "https://southbaytoday.org";
const audit = fileURLToPath(new URL("../audit-discovery.mjs", import.meta.url));

function page(path, { pending = false, note = true, schema = !pending } = {}) {
  const url = site + path;
  return `<html lang="en"><head><title>Source-backed event</title>
    <meta name="description" content="An organizer's event details.">
    <link rel="canonical" href="${url}"></head><body>
    <h1${pending ? ' data-attendance-status="needs-confirmation"' : ""}>Community event</h1>
    ${pending && note ? '<p data-attendance-note="needs-confirmation">The source lists conflicting times. Confirm with the organizer.</p>' : ""}
    ${schema ? `<script type="application/ld+json">${JSON.stringify({
      "@context": "https://schema.org", "@type": "Event", url,
      sameAs: "https://organizer.example/event", startDate: "2100-01-01",
      eventStatus: "https://schema.org/EventScheduled",
    })}</script>` : ""}
    <time datetime="2026-10-27">Updated October 27</time></body></html>`;
}

test("discovery CLI respects source conflicts without hiding missing or contradictory Event markup", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "sbt-discovery-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const paths = ["/event/confirmed", "/event/pending", ...Array.from({ length: 498 }, (_, i) => `/fixture/${i}`)];
  const writePage = (path, options) => {
    const file = join(dir, path, "index.html");
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, page(path, options));
  };
  for (const path of paths) writePage(path, { schema: path === "/event/confirmed", pending: path === "/event/pending" });
  writeFileSync(join(dir, "sitemap-index.xml"), `<sitemapindex><sitemap><loc>${site}/sitemap-0.xml</loc></sitemap></sitemapindex>`);
  writeFileSync(join(dir, "sitemap-0.xml"), `<urlset>${paths.map(path => `<url><loc>${site}${path}</loc></url>`).join("")}</urlset>`);
  writeFileSync(join(dir, "robots.txt"), `User-agent: OAI-SearchBot\nUser-agent: Claude-SearchBot\nUser-agent: Claude-User\nAllow: /\nSitemap: ${site}/sitemap-index.xml\n`);
  writeFileSync(join(dir, "llms.txt"), "/event/ /rss.xml /api/south-bay/upcoming-events /about /sitemap-index.xml");
  const run = () => {
    const result = spawnSync(process.execPath, [audit, `--dir=${dir}`, "--json"], { encoding: "utf8" });
    assert.equal(result.signal, null, result.stderr);
    return { status: result.status, ...JSON.parse(result.stdout) };
  };

  await t.test("a visible source conflict permits zero Events and remains a warning", () => {
    const result = run();
    assert.equal(result.status, 0);
    assert.deepEqual(result.errors, []);
    assert.ok(result.warnings.some(message => message.includes("awaits organizer confirmation")));
  });
  await t.test("a confirmed occurrence still requires an Event", () => {
    writePage("/event/confirmed", { schema: false });
    const result = run();
    assert.equal(result.status, 1);
    assert.ok(result.errors.some(message => message.includes("must expose exactly one Event object")));
    writePage("/event/confirmed");
  });
  await t.test("an unconfirmed occurrence cannot advertise a scheduled Event", () => {
    writePage("/event/pending", { pending: true, schema: true });
    const result = run();
    assert.equal(result.status, 1);
    assert.ok(result.errors.some(message => message.includes("needs organizer confirmation but still exposes")));
  });
  await t.test("an unconfirmed occurrence must explain the conflict to readers", () => {
    writePage("/event/pending", { pending: true, note: false });
    const result = run();
    assert.equal(result.status, 1);
    assert.ok(result.errors.some(message => message.includes("has no visible attendance note")));
  });
});
