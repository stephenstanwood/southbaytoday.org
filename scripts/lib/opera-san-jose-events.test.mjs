import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { parseOperaSanJoseDate } from "../generate-events.mjs";

// Organizer's November 2026 and February 2027 performance labels. A UTC
// refresh previously moved every date to the preceding Pacific day.
const labels = [
  ["Sun, November 15, 2026", "2026-11-15"],
  ["Fri, November 20, 2026", "2026-11-20"],
  ["Sun, November 22, 2026", "2026-11-22"],
  ["Sat, November 28, 2026", "2026-11-28"],
  ["Sun, November 29, 2026", "2026-11-29"],
  ["Sun, February 14, 2027", "2027-02-14"],
  ["Fri, February 19, 2027", "2027-02-19"],
  ["Sun, February 21, 2027", "2027-02-21"],
  ["Fri, February 26, 2027", "2027-02-26"],
  ["Sun, February 28, 2027", "2027-02-28"],
];

for (const tz of ["UTC", "America/Los_Angeles", "Asia/Tokyo"]) {
  test(`Opera San José keeps the organizer's calendar dates on ${tz} hosts`, () => {
    const generator = new URL("../generate-events.mjs", import.meta.url).href;
    const dates = new URL("./dates.mjs", import.meta.url).href;
    const child = spawnSync(process.execPath, ["--input-type=module", "-e", `
      import { parseOperaSanJoseDate } from ${JSON.stringify(generator)};
      import { isoDate } from ${JSON.stringify(dates)};
      console.log(JSON.stringify(${JSON.stringify(labels)}.map(([label]) => isoDate(parseOperaSanJoseDate(label)))));
    `], { encoding: "utf8", env: { ...process.env, TZ: tz } });
    assert.equal(child.status, 0, child.stderr);
    assert.deepEqual(JSON.parse(child.stdout.trim()), labels.map(([, date]) => date));
  });
}

test("invalid or missing opera dates stay unknown", () => {
  for (const label of ["", "TBD", "February 30, 2027", "NoSuchMonth 15, 2026"]) {
    assert.equal(parseOperaSanJoseDate(label), null, label);
  }
});
