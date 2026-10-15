import assert from "node:assert/strict";
import test from "node:test";

import { parseMontalvoOccurrencePage } from "./montalvoOccurrence.mjs";

test("paid admission outranks a zero calendar price and a free child tier", () => {
  const parsed = parseMontalvoOccurrencePage(`
    <head><title>Family Festival</title><script type="application/ld+json">{"offers":{"price":0}}</script></head>
    <body><h1 id="tn-page-heading">Family Festival</h1>
      <p class="tn-event-detail__description"><p>Bring the whole family.</p>
        <p>Activities for kids ages 0–10.</p></p>
      <div data-tn-price-amount="20.0000000000"></div>
      <div data-tn-price-amount="14.0000000000"></div>
      <div data-tn-price-amount="0.0000"></div>
    </body>`);
  assert.equal(parsed.cost, "paid");
  assert.equal(parsed.kidFriendly, true);
});

test("student audience survives nested overview and ticket-page description blocks", () => {
  for (const className of [
    "tn-production-season-detail-page__description",
    "tn-prod-season-header__description-text-content",
  ]) {
    const parsed = parseMontalvoOccurrencePage(`
      <h1 id="tn-page-heading">Student Matinee</h1>
      <div class="${className}"><div><p>Designed to serve school groups,
        youth, and homeschooled students.</p></div></div>`);
    assert.equal(parsed.kidFriendly, true);
    assert.equal(parsed.cost, null);
  }
});

test("an unrelated family-workshop promotion never changes a concert's audience", () => {
  const parsed = parseMontalvoOccurrencePage(`
    <h1 id="tn-page-heading">Evening Concert</h1>
    <div class="tn-prod-season-header__description-text-content"><p>Contemporary soul.</p></div>
    <p class="tn-event-detail__description"><p>Members can log in for discounts.</p></p>
    <aside>Bring the whole family to our next workshop. Activities for kids.</aside>`);
  assert.equal(parsed.kidFriendly, undefined);
  assert.equal(parsed.cost, null);
});

test("explicit zero-price admission remains free without paid tickets", () => {
  const parsed = parseMontalvoOccurrencePage(`
    <h1 id="tn-page-heading">Community Festival</h1>
    <div data-tn-price-amount="0.0000"></div>`);
  assert.equal(parsed.cost, "free");
});

test("visible Montalvo occurrence details outrank stale head metadata", () => {
  const parsed = parseMontalvoOccurrencePage(`
    <html>
      <head>
        <title>2026 Marcus Festival: Enter if You Dare | Montalvo Arts Center</title>
        <meta name="description" content="Festival runs 6:00pm–10:30pm">
      </head>
      <body>
        <h1 id="tn-page-heading">2026 Marcus Festival: Enter if You Dare</h1>
        <p class="tn-event-detail__display-time">Friday, Jul 17, 2026 6:00PM</p>
        <div><strong>Enter If You Dare is a FREE public arts festival happening July 17, 2026 from 6:00pm – 10:00 pm.</strong></div>
        <div data-tn-price-amount="0.0000"></div>
      </body>
    </html>`);

  assert.deepEqual(parsed, {
    title: "2026 Marcus Festival: Enter if You Dare",
    date: "2026-07-17",
    time: "6:00 PM",
    endTime: "10:00 PM",
    cost: "free",
  });
});
