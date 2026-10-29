import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const scripts = dirname(fileURLToPath(import.meta.url));
const cities = ["campbell", "saratoga", "los-altos", "los-gatos", "san-jose", "mountain-view", "sunnyvale", "cupertino", "santa-clara", "milpitas", "palo-alto"];
function run({ publishedDate = "2026-10-15", unavailable = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), "sbt-digest-source-"));
  try {
    mkdirSync(join(root, "scripts"));
    mkdirSync(join(root, "src/data/south-bay"), { recursive: true });
    copyFileSync(join(scripts, "generate-digests.mjs"), join(root, "scripts/generate-digests.mjs"));
    symlinkSync(join(scripts, "lib"), join(root, "scripts/lib"));
    const previous = Object.fromEntries(cities.map((city) => [city, {
      city, cityName: city, body: "City Council", meetingDateIso: "2026-10-26",
      title: `${city} previous digest`, summary: "Previously verified agenda", keyTopics: ["Original topic"],
      sourceUrl: "https://example.test/previous", generatedAt: "2026-10-27T01:00:00.000Z",
    }]));
    previous["palo-alto"] = { ...previous["palo-alto"], body: "Architectural Review Board", meetingDateIso: publishedDate };
    const output = join(root, "src/data/south-bay/digests.json");
    writeFileSync(output, JSON.stringify(previous));
    const capture = join(root, "prompts.json");
    const fixture = join(scripts, "fixtures/primegov");
    writeFileSync(join(root, "source-mocks.mjs"), `
      import fs from 'node:fs';
      const RealDate = Date;
      globalThis.Date = class extends RealDate {
        constructor(...args) { super(...(args.length ? args : ['2026-10-29T03:40:00Z'])); }
        static now() { return new RealDate('2026-10-29T03:40:00Z').getTime(); }
      };
      const fixture = ${JSON.stringify(fixture)};
      const prompts = [];
      globalThis.fetch = async (input, init) => {
        const url = new URL(String(input));
        if (url.hostname === 'www.stoa.works' && url.pathname === '/api/council-meetings') {
          const records = url.searchParams.get('city') === 'Palo Alto' ? [{
            id: 215, city: 'Palo Alto', date: '2026-10-22', meetingType: 'City Council', source: 'ingest',
            title: 'Review Fiscal Year 2026 Actuals and 2027 Adopted – No Action Needed (10 min)',
            excerpt: 'Review Fiscal Year 2026 Actuals and 2027 Adopted – No Action Needed (10 min). Memorandum for Fiscal Year 2026 Actual Expenditures – Action Needed (10 min). Capital Update – No Action Needed (15 min)',
            keywords: ['budget'],
          }] : [];
          return Response.json({records});
        }
        if (url.hostname === 'cityofpaloalto.primegov.com') {
          if (${unavailable}) return new Response('source unavailable', {status: 503});
          if (url.pathname.includes('ListArchivedMeetings')) return Response.json(JSON.parse(fs.readFileSync(fixture + '/archive-2026.json')));
          const id = url.searchParams.get('compiledMeetingDocumentFileId');
          if (id === '21874' || id === '21819') return new Response(fs.readFileSync(fixture + (id === '21874' ? '/council-oct26.html' : '/stormwater-oct22.html')));
        }
        if (url.hostname === 'api.anthropic.com') {
          prompts.push(JSON.parse(init.body)); fs.writeFileSync(${JSON.stringify(capture)}, JSON.stringify(prompts));
          return Response.json({ stop_reason: 'end_turn', content: [{type: 'text', text: JSON.stringify({
            summary: 'The agenda listed winter storm preparedness and proposed changes to stream corridor protection.',
            keyTopics: ['Review of winter storm preparedness activities', 'Proposed stream corridor protection changes'],
          })}] });
        }
        // Other cities retain their own published cards; no live I/O in this fixture.
        return new Response('unavailable in offline fixture', {status: 503});
      };
    `);
    const log = execFileSync(process.execPath, ["--import", join(root, "source-mocks.mjs"), join(root, "scripts/generate-digests.mjs")], {
      cwd: root, encoding: "utf8", timeout: 30_000,
      env: { ...process.env, ANTHROPIC_API_KEY: "offline-fixture", SBT_NOTIFICATION_TEST_DIR: join(root, "notifications") },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const digests = JSON.parse(readFileSync(output));
    let prompts = [];
    try { prompts = JSON.parse(readFileSync(capture)); } catch {}
    return { previous, digests, prompts, log };
  } finally { rmSync(root, { recursive: true, force: true }); }
}

test("the real digest generator recovers Council content from a fresh mislabeled committee record", () => {
  const { previous, digests, prompts, log } = run();
  const card = digests["palo-alto"];
  assert.equal(card.body, "City Council");
  assert.equal(card.meetingDateIso, "2026-10-26");
  assert.equal(card.sourceUrl, "https://cityofpaloalto.primegov.com/Portal/Meeting?compiledMeetingDocumentFileId=21874");
  assert.equal(card.carriedForward, undefined);
  assert.equal(prompts.length, 1);
  assert.match(JSON.stringify(prompts), /Winter Storm Preparedness/);
  assert.match(JSON.stringify(prompts), /Chapter 18\.20/);
  assert.doesNotMatch(JSON.stringify(prompts), /Review Fiscal Year 2026 Actuals/);
  assert.match(log, /recovered verified City Council agenda \(2026-10-26\) from PrimeGov/);
  for (const city of cities.filter((city) => city !== "palo-alto")) {
    assert.equal(digests[city].summary, previous[city].summary);
    assert.equal(digests[city].generatedAt, previous[city].generatedAt);
  }
});

test("a rerun recovers before the published-date guard instead of becoming stuck again", () => {
  const { digests, prompts } = run({ publishedDate: "2026-10-26" });
  assert.equal(digests["palo-alto"].meetingDateIso, "2026-10-26");
  assert.equal(digests["palo-alto"].body, "City Council");
  assert.equal(digests["palo-alto"].carriedForward, undefined);
  assert.equal(prompts.length, 1);
});

test("unavailable sources and older recovered agendas preserve the published digest", () => {
  for (const args of [{ unavailable: true }, { publishedDate: "2026-10-27" }]) {
    const { previous, digests, prompts } = run(args);
    const card = digests["palo-alto"];
    for (const key of ["meetingDateIso", "body", "summary", "generatedAt", "sourceUrl"]) {
      assert.equal(card[key], previous["palo-alto"][key]);
    }
    assert.equal(card.carriedForward, true);
    assert.equal(prompts.length, 0);
  }
});
