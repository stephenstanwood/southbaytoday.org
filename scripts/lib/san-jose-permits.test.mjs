import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseSanJosePermitCsv, fetchSanJosePermitRecords, SAN_JOSE_PERMITS_CSV_URL } from "./san-jose-permits.mjs";
import { generatePermitPulse } from "../generate-permits.mjs";
import { generateRestaurantRadar } from "../generate-restaurant-radar.mjs";

const headers = ["gx_location", "FOLDERNUMBER", "FOLDERDESC", "FOLDERNAME", "WORKDESCRIPTION", "SUBTYPEDESCRIPTION", "ISSUEDATE", "DWELLINGUNITS", "PERMITVALUATION", "APPLICANT"];
const rows = [
  ["100 EXAMPLE ST, SAN JOSE CA", "example-cafe", "Commercial/Industrial", "Example Cafe Ti", "Tenant Improvement", "Restaurant", "10/20/2026 12:00:00 AM", "0", "250000", "Example Applicant"],
  ["200 EXAMPLE ST, SAN JOSE CA", "example-home", "Single Family", "Example Residence", "New Construction", "Single-Family", "10/20/2026 12:00:00 AM", "1", "500000", "Cafe Contractor"],
  ["300 EXAMPLE ST, SAN JOSE CA", "example-office", "Commercial/Industrial", "Example Office", "Tenant Improvement", "Office", "10/20/2026 12:00:00 AM", "0", "250000", "Restaurant Owner"],
];
const csv = (records) => [headers, ...records].map((row) => row.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(",")).join("\r\n") + "\r\n";
const now = new Date("2026-10-23T22:00:00Z");
const noSleep = async () => {};

test("the published download preserves CSV commas, quotes, multiline copy and a BOM", () => {
  const row = [...rows[0]];
  row[3] = 'Example Cafe "Courtyard",\r\nInterior TI';
  const parsed = parseSanJosePermitCsv("\uFEFF" + csv([row]));
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].gx_location, row[0]);
  assert.equal(parsed[0].FOLDERNAME, row[3]);
  assert.equal(parsed[0].PERMITVALUATION, "250000");
});

test("HTML, empty downloads, missing columns and malformed CSV fail closed", () => {
  for (const body of ["", "<html>Access denied</html>", csv([]), csv([rows[0]]).replace('"DWELLINGUNITS"', '"WRONG"'),
    csv([rows[0]]).slice(0, -4), csv([rows[0].slice(0, -1)]), csv([rows[0]]).replace('"example-cafe"', '"example"oops')]) {
    assert.throws(() => parseSanJosePermitCsv(body), /San José permit CSV/);
  }
});

test("download uses the published source and its crawl delay without an API fallback", async () => {
  const requests = [], waits = [];
  const records = await fetchSanJosePermitRecords({
    sleep: async (ms) => waits.push(ms),
    fetchImpl: async (url) => { requests.push(url); return new Response(csv(rows)); },
  });
  assert.deepEqual(requests, [SAN_JOSE_PERMITS_CSV_URL]);
  assert.deepEqual(waits, [10000]);
  assert.equal(records.length, 3);
  const failed = [];
  await assert.rejects(fetchSanJosePermitRecords({ sleep: noSleep, fetchImpl: async (url) => {
    failed.push(url); return new Response("Forbidden", { status: 403 });
  } }), /HTTP 403/);
  assert.deepEqual(failed, [SAN_JOSE_PERMITS_CSV_URL]);
});

test("both real generators use the download and retire Permit View publication", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sbt-permit-source-test-"));
  try {
    const pulsePath = join(dir, "pulse.json"), radarPath = join(dir, "radar.json");
    writeFileSync(pulsePath, JSON.stringify({ cities: { "palo-alto": { permits: [{ id: "retired" }] }, campbell: { preserved: true } } }));
    writeFileSync(radarPath, JSON.stringify({ items: [{ city: "palo-alto", id: "retired" }] }));
    const requests = [];
    const fetchImpl = async (url) => {
      requests.push(url);
      assert.equal(url, SAN_JOSE_PERMITS_CSV_URL, "neither API nor retired Permit View may be requested");
      return new Response(csv(rows));
    };
    await generatePermitPulse({ fetchImpl, sleep: noSleep, outputPath: pulsePath, now });
    const pulse = JSON.parse(readFileSync(pulsePath));
    assert.equal(pulse.cities["palo-alto"], undefined);
    assert.deepEqual(pulse.cities.campbell, { preserved: true });
    assert.deepEqual(pulse.cities["san-jose"].stats, { total: 3, notable: 3, newUnits: 1, totalValuation: 1000000 });
    await generateRestaurantRadar({ fetchImpl, sleep: noSleep, outputPath: radarPath, placesApiKey: "", now });
    const radar = JSON.parse(readFileSync(radarPath));
    assert.deepEqual(radar.cities, ["San Jose"]);
    assert.deepEqual(radar.items.map((item) => item.id), ["example-cafe"]);
    assert.equal(radar.items[0].city, "san-jose");
    assert.deepEqual(requests, [SAN_JOSE_PERMITS_CSV_URL, SAN_JOSE_PERMITS_CSV_URL]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("a failed or malformed download leaves each generator's existing artifact intact", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sbt-permit-source-failure-test-"));
  try {
    for (const generate of [generatePermitPulse, generateRestaurantRadar]) {
      const path = join(dir, "output.json"), before = '{"existing":"last verified output"}\n';
      for (const response of [() => new Response("Forbidden", { status: 403 }), () => new Response("<html>Not a CSV</html>")]) {
        writeFileSync(path, before);
        await assert.rejects(generate({ fetchImpl: async () => response(), sleep: noSleep, outputPath: path, placesApiKey: "", now }));
        assert.equal(readFileSync(path, "utf8"), before);
      }
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
