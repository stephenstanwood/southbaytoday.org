import test from "node:test";
import assert from "node:assert/strict";
import { inboundPublisherCity } from "./inbound-publisher-city.mjs";

test("explicit extractor city wins over sender fallback", () => {
  assert.equal(
    inboundPublisherCity({
      cityKey: "campbell",
      fromEmail: "news@info.SantaClaraCA.gov",
    }),
    "campbell",
  );
});

test("known official senders recover an omitted publisher city", () => {
  const fixtures = [
    ["MountainView@public.govdelivery.com", "mountain-view"],
    ["cityofsunnyvale@public.govdelivery.com", "sunnyvale"],
    ["PRCustomerServe@info.SantaClaraCA.gov", "santa-clara"],
    ["news@info.SantaClaraCA.gov", "santa-clara"],
    ["cardinal@mail.gostanford.com", "palo-alto"],
    ["latest@email.live.stanford.edu", "palo-alto"],
  ];

  for (const [fromEmail, expected] of fixtures) {
    assert.equal(inboundPublisherCity({ fromEmail }), expected, fromEmail);
  }
});

test("unknown and lookalike senders cannot assign a city", () => {
  assert.equal(inboundPublisherCity({ fromEmail: "events@example.com" }), null);
  assert.equal(
    inboundPublisherCity({ fromEmail: "news@info.santaclaraca.gov.example" }),
    null,
  );
  assert.equal(inboundPublisherCity(null), null);
});
