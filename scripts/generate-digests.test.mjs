import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { polishCivicCopy, polishCivicModifiers, polishCivicTopic } from "./lib/civic-copy.mjs";

const scripts = dirname(fileURLToPath(import.meta.url));
const cities = ["campbell", "saratoga", "los-altos", "los-gatos", "san-jose", "mountain-view", "sunnyvale", "cupertino", "santa-clara", "milpitas", "palo-alto"];
function run({ publishedDate = "2026-10-15", unavailable = false, runs = 1,
  keyTopics = ['Review of winter storm preparedness activities', 'Proposed stream corridor protection changes'],
  summary = "The agenda listed winter storm preparedness and proposed changes to stream corridor protection." } = {}) {
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
            summary: ${JSON.stringify(summary)},
            keyTopics: ${JSON.stringify(keyTopics)},
          })}] });
        }
        // Other cities retain their own published cards; no live I/O in this fixture.
        return new Response('unavailable in offline fixture', {status: 503});
      };
    `);
    let log = "";
    const requestCounts = [];
    for (let attempt = 0; attempt < runs; attempt++) {
    rmSync(capture, { force: true });
    log = execFileSync(process.execPath, ["--import", join(root, "source-mocks.mjs"), join(root, "scripts/generate-digests.mjs")], {
      cwd: root, encoding: "utf8", timeout: 30_000,
      env: { ...process.env, ANTHROPIC_API_KEY: "offline-fixture", SBT_NOTIFICATION_TEST_DIR: join(root, "notifications"), SBT_GENERATION_CACHE_DIR: join(root, "cache") },
      stdio: ["ignore", "pipe", "pipe"],
    });
    try { requestCounts.push(JSON.parse(readFileSync(capture)).length); } catch { requestCounts.push(0); }
    }
    const digests = JSON.parse(readFileSync(output));
    let prompts = [];
    try { prompts = JSON.parse(readFileSync(capture)); } catch {}
    return { previous, digests, prompts, log, requestCounts };
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


test("the real digest rerun verifies sources but avoids a second unchanged-input API call", () => {
  const { digests, requestCounts, log } = run({ runs: 2 });
  assert.deepEqual(requestCounts, [1, 0]);
  assert.equal(digests["palo-alto"].body, "City Council");
  assert.match(log, /trying PrimeGov.*got 2026-10-26/);
  assert.match(log, /unchanged verified source\/prompt\/model; reused result/);
});

test("civic generation preserves the complete reviewed area summary and its facts", () => {
  const before = "The October 26 Planning Commission study session agenda listed a proposal at 536 Hawthorn Avenue to demolish a 1,360 square foot duplex on a 0.29-acre R-3 lot and build three townhome-style condominiums in one two-story building. It also listed a tentative parcel map to split the lot into three.";
  const after = "The October 26 Planning Commission study session agenda listed a proposal at 536 Hawthorn Avenue to demolish a 1,360-square-foot duplex on a 0.29-acre R-3 lot and build three townhome-style condominiums in one two-story building. It also listed a tentative parcel map to split the lot into three.";
  const { digests } = run({ summary: before });
  assert.equal(digests["palo-alto"].summary, after);
  assert.deepEqual(after.match(/\d+(?:[,.]\d+)*/g), before.match(/\d+(?:[,.]\d+)*/g));
  assert.equal(polishCivicCopy(after), after);

  const replacement = "A revised proposal lists a 2,450.5 square foot duplex at 900 New Avenue. Staff requested a continuance to December 14, 2026. See https://example.org/proposal/2450.";
  assert.equal(polishCivicCopy(replacement), replacement.replace("2,450.5 square foot duplex", "2,450.5-square-foot duplex"));
});

test("civic area copy preserves measurements, prices, existing hyphens, and non-text values", () => {
  for (const value of [
    "The building measures 1,360 square feet and costs $300 per square foot.",
    "Allow 1 square foot per resident and measure 1 square foot of floor space.",
    "The 1,360-square-foot duplex is listed for review.",
    null, undefined, 1360,
  ]) assert.equal(polishCivicCopy(value), value);
  assert.equal(polishCivicCopy("The November 3, 2026 meeting listed a 900 square foot building."),
    "The November 3, 2026, meeting listed a 900-square-foot building.");
});

test("civic modifiers keep numbers, identifiers, headline dates, and standalone terms exact", () => {
  const copy = "The fee for below market rate in-lieu fees would become a square footage-based fee. A City Council sponsored special event costs $25. See https://example.org/below-market-rate or email fee@example.org.";
  const reviewed = copy.replace("below market rate", "below-market-rate")
    .replace("square footage-based", "square-footage-based").replace("City Council sponsored", "City Council-sponsored");
  assert.equal(polishCivicCopy(copy), reviewed);
  assert.equal(polishCivicCopy(reviewed), reviewed);
  assert.deepEqual(reviewed.match(/\d+/g), copy.match(/\d+/g));
  const headline = "November 4, 2026 agenda: below market rate in-lieu fee changes";
  assert.equal(polishCivicModifiers(headline), headline.replace("below market rate", "below-market-rate"));
  for (const value of ["Fees remain below market rate.", "Measure the square footage.", null]) {
    assert.equal(polishCivicModifiers(value), value);
  }
});

test("the real digest generator finishes sentence topics but preserves fragments and identifiers", () => {
  const keyTopics = [
    "The agenda listed a proposed agreement not to exceed $165,000 for fiscal year 2026-27",
    "The Consent Calendar included the 2026 Annual Code Update",
    "A revised Citywide Records Retention Schedule was listed for adoption by resolution on the Consent Calendar",
    "The Consent Calendar also listed the Treasurer's Report for the month ended September 30, 2026",
    "Review of the November 10, 2026, final City Council agenda",
    "The agenda listed details at https://example.org/agenda/2026",
  ];
  const { digests } = run({ keyTopics });
  assert.deepEqual(digests["palo-alto"].keyTopics, keyTopics.map((topic, i) => i < 4 ? topic + "." : topic));
  for (const topic of keyTopics) {
    const next = polishCivicTopic(topic);
    assert.equal(polishCivicTopic(next), next);
    assert.deepEqual(next.match(/\d+/g), topic.match(/\d+/g));
  }
  for (const value of ["The agenda listed a request to email fee@example.org", "The agenda listed a public hearing.", "The agenda listed:", null]) {
    assert.equal(polishCivicTopic(value), value);
  }
});
