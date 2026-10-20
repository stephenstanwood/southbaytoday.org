import assert from "node:assert/strict";
import test from "node:test";

import { isAroundTownPermitCandidate, permitValuationForPrompt, hasUnsupportedZeroPermitValuation } from "./around-town-permits.mjs";

test("unavailable valuations cannot become a declared zero-dollar amount", () => {
  for (const valuation of [0, undefined, null, NaN, -1]) {
    assert.equal(permitValuationForPrompt({ valuation }), "permit valuation unavailable");
  }
  assert.equal(permitValuationForPrompt({ valuation: 641_692 }), "declared permit valuation $641,692");
  assert.equal(hasUnsupportedZeroPermitValuation({ summary: "A declared permit valuation of $0." }), true);
  assert.equal(hasUnsupportedZeroPermitValuation({ summary: "The permit valuation was $0.00." }), true);
  assert.equal(hasUnsupportedZeroPermitValuation({ summary: "A zero-dollar permit valuation." }), true);
  assert.equal(hasUnsupportedZeroPermitValuation({ summary: "A permit valuation of $641,692." }), false);
  assert.equal(hasUnsupportedZeroPermitValuation({ summary: "A permit valuation of $0.50." }), false);
  assert.equal(hasUnsupportedZeroPermitValuation({ summary: "Valuation is unavailable." }), false);
});

test("rejects a sign-only entitlement", () => {
  assert.equal(
    isAroundTownPermitCandidate({
      category: "entitlement",
      description: "One wall sign and one projecting blade sign",
    }),
    false,
  );
  assert.equal(
    isAroundTownPermitCandidate({
      category: "entitlement",
      description: 'Request for Architectural Review for the installation of (3) illuminated wall signs for "TIAA".',
    }),
    false,
  );
  assert.equal(
    isAroundTownPermitCandidate({
      category: "entitlement",
      description: "Request for Architectural Review for two NEW LED Channel Letter wall signs FOR MASSAGE ENVY.",
    }),
    false,
  );
});

test("keeps substantial commercial and housing permits", () => {
  assert.equal(
    isAroundTownPermitCandidate({
      category: "commercial-large",
      description: "Second-floor office tenant improvement",
      valuation: 15_000_000,
    }),
    true,
  );
  assert.equal(
    isAroundTownPermitCandidate({
      category: "residential-new",
      description: "Five-unit townhouse building",
      units: 5,
    }),
    true,
  );
  assert.equal(
    isAroundTownPermitCandidate({
      category: "entitlement",
      description: "Mixed-use housing project with a signage plan",
    }),
    true,
  );
});

test("rejects routine reroof permits", () => {
  assert.equal(
    isAroundTownPermitCandidate({
      category: "commercial-large",
      description: "Commercial reroof",
      valuation: 900_000,
    }),
    false,
  );
});
