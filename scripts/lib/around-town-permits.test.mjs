import assert from "node:assert/strict";
import test from "node:test";

import { isAroundTownPermitCandidate } from "./around-town-permits.mjs";

test("rejects a sign-only entitlement", () => {
  assert.equal(
    isAroundTownPermitCandidate({
      category: "entitlement",
      description: "One wall sign and one projecting blade sign",
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
