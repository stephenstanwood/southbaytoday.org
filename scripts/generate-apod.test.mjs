import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { APOD_ARCHIVE, parseApodArchive, parseApodArticle, validateApodItems } from "./lib/apod.mjs";
import { generateApod } from "./generate-apod.mjs";

const fixture = name => readFileSync(new URL(`./fixtures/apod/${name}`, import.meta.url), "utf8");
const archive = fixture("archive.html");
const entries = parseApodArchive(archive);
const byDate = date => entries.find(entry => entry.date === date);
const rollover = fixture("rollover.html"), image = fixture("image.html"), video = fixture("video.html");
const latest = parseApodArticle(rollover, byDate("2026-10-21"));
const older = parseApodArticle(image, byDate("2026-10-17"));
const generic = '<html><title>NASA Science</title><main><img src="https://science.nasa.gov/wp-content/themes/nasa-child/assets/images/nasa-logo@2x.png"></main></html>';
const selected = archive.replace(/<a\b[^>]*>[\s\S]*?<\/a>/g, tag => /apod-2026-october-(21|18|17)-/.test(tag) ? tag : "");
const responses = new Map([[APOD_ARCHIVE, selected], [byDate("2026-10-21").sourceUrl, rollover],
  [byDate("2026-10-18").sourceUrl, video], [byDate("2026-10-17").sourceUrl, image]]);
const htmlResponse = body => new Response(body, { headers: { "content-type": "text/html; charset=UTF-8" } });

test("NASA's archive supplies 15 real dates, permalinks and titles, ordered newest first", () => {
  assert.equal(entries.length, 15);
  assert.equal(entries[0].date, "2026-10-21");
  assert.equal(entries.at(-1).date, "2026-10-07");
  assert.equal(entries[0].title, "New Ghosts Revealed in Cassiopeia");
  assert.equal(parseApodArchive(archive, { startDate: "2026-10-20", endDate: "2026-10-21" }).length, 2);
  assert.throws(() => parseApodArchive(archive.replace("APOD: 2026 October 21", "APOD: 2026 October 22")), /label\/permalink/);
  assert.throws(() => parseApodArchive(archive.replace("https://science.nasa.gov/image-article/", "https://example.com/image-article/")), /permalink/);
});

test("real NASA rollover and ordinary image modules preserve media and attribution", () => {
  assert.match(latest.url, /IC63\.png\?w=2622&h=1751&/);
  assert.doesNotMatch(latest.url, /annoted|logo|&amp;/);
  assert.match(latest.copyright, /Louis Leroux-Géré/);
  assert.match(latest.explanation, /^Jinkies, look at all those ghosts!/);
  assert.doesNotMatch(latest.explanation, /Explanation:|Tomorrow|<|>/);
  assert.match(older.hdurl, /\/content\/dam\/science\/cds\/apod\//);
  assert.match(older.explanation, /^Put on your red\/blue glasses/);
  assert.equal(older.title, "3D 67P");
  assert.equal(parseApodArticle(video, byDate("2026-10-18")), null);
});

test("landing pages, date/title/canonical mismatches and missing featured media fail closed", () => {
  assert.throws(() => parseApodArticle(generic, entries[0]), /canonical/);
  assert.throws(() => parseApodArticle(rollover.replace(/October 21, 2026/g, "October 20, 2026"), entries[0]), /date\/title/);
  assert.throws(() => parseApodArticle(rollover.replace("New Ghosts Revealed", "Different Ghosts Revealed"), entries[0]), /date\/title/);
  assert.throws(() => parseApodArticle(rollover.replace('rel="canonical"', 'rel="alternate"'), entries[0]), /canonical/);
  // A footer logo must not replace a missing featured image, even on a valid article.
  const noImage = rollover.replace(/<img\b[^>]*>/g, "").replace("</main>", `</main><footer>${generic}</footer>`);
  assert.throws(() => parseApodArticle(noImage, entries[0]), /image URL/);
});

test("the exact rejected 12-row committed artifact cannot pass semantic validation", () => {
  const invalid = JSON.parse(fixture("invalid-baseline.json"));
  assert.equal(invalid.items.length, 12);
  assert.equal(new Set(invalid.items.map(item => item.date)).size, 12);
  assert.deepEqual([...new Set(invalid.items.map(item => item.title))], ["NASA Science"]);
  assert.equal(new Set(invalid.items.map(item => item.explanation)).size, 1);
  assert.throws(() => validateApodItems(invalid.items), /Generic or repeated/);
});

test("independent title, explanation, image and date checks catch plausible repetition", () => {
  validateApodItems([latest, older]);
  for (const [field, pattern] of [["title", /title/], ["explanation", /explanation/], ["url", /image/], ["hdurl", /image/], ["date", /date/]]) {
    assert.throws(() => validateApodItems([latest, { ...older, [field]: latest[field] }]), pattern);
  }
  assert.throws(() => validateApodItems([latest, { ...older, url: latest.url.replace("w=2622", "w=100") }]), /Repeated.*image/);
  assert.throws(() => validateApodItems([{ ...latest, url: "https://science.nasa.gov/wp-content/themes/nasa-child/assets/images/nasa-logo@2x.png" }]), /Generic or non-APOD/);
  assert.throws(() => validateApodItems([{ ...latest, date: "2026-02-30" }]), /date/);
  assert.throws(() => validateApodItems([{ ...latest, date: "2026-10-20" }]), /source\/date/);
  assert.throws(() => validateApodItems([older, latest]), /date/);
  assert.throws(() => validateApodItems([]), /Expected/);
});

test("the generator writes only verified images, uses Eastern dates, and keeps source links", async t => {
  const dir = mkdtempSync(join(tmpdir(), "sbt-apod-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const outPath = join(dir, "apod.json"), requests = [];
  const result = await generateApod({ outPath, now: new Date("2026-10-22T01:00:00Z"), report() {}, pause: async ms => assert.equal(ms, 1_000),
    fetchImpl: async (url, options) => { requests.push(url); assert.equal(options.redirect, "error"); assert(responses.has(url)); return htmlResponse(responses.get(url)); } });
  assert.deepEqual(result.items.map(item => item.date), ["2026-10-21", "2026-10-17"]);
  assert.deepEqual(JSON.parse(readFileSync(outPath, "utf8")), result);
  assert.equal(result.items[0].sourceUrl, entries[0].sourceUrl);
  assert.equal(requests.length, 4);
});

test("failed acquisition, stale sources and malformed content leave exact previous bytes intact", async t => {
  const dir = mkdtempSync(join(tmpdir(), "sbt-apod-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const outPath = join(dir, "apod.json"), before = fixture("invalid-baseline.json");
  writeFileSync(outPath, before);
  const cases = [
    async () => htmlResponse(generic),
    async () => new Response("unavailable", { status: 503 }),
    async () => new Response("rate limited", { status: 429 }),
    async () => { throw Error("redirect rejected"); },
    async () => new Response("{}", { headers: { "content-type": "application/json" } }),
    async url => htmlResponse(url === APOD_ARCHIVE ? selected : generic),
    async url => htmlResponse(url === APOD_ARCHIVE ? selected : url === entries[0].sourceUrl ? rollover : "<main>broken</main>"),
  ];
  for (const fetchImpl of cases) {
    await assert.rejects(generateApod({ outPath, fetchImpl, now: new Date("2026-10-21T12:00:00Z"), pause: async () => {}, report() {} }));
    assert.equal(readFileSync(outPath, "utf8"), before);
  }
  await assert.rejects(generateApod({ outPath, fetchImpl: async () => htmlResponse(archive), now: new Date("2026-10-25T12:00:00Z"), report() {} }), /no current/);
  assert.equal(readFileSync(outPath, "utf8"), before);
});

test("real CLI exits nonzero and preserves bytes for the rejected baseline and landing page", t => {
  const dir = mkdtempSync(join(tmpdir(), "sbt-apod-cli-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const output = join(dir, "apod.json"), loader = join(dir, "network.mjs");
  const before = fixture("invalid-baseline.json");
  writeFileSync(output, before);
  writeFileSync(loader, `globalThis.fetch = async () => new Response(${JSON.stringify(generic)}, { headers: { "content-type": "text/html" } });`);
  const script = fileURLToPath(new URL("./generate-apod.mjs", import.meta.url));
  for (const args of [["--check", output], ["--import", loader, script, "--output", output]]) {
    const child = spawnSync(process.execPath, args[0] === "--check" ? [script, ...args] : args, { encoding: "utf8" });
    assert.equal(child.status, 1, child.stdout + child.stderr);
    assert.equal(readFileSync(output, "utf8"), before);
  }
});
