import assert from "node:assert/strict";
import test from "node:test";

import { findMontalvoPerformanceUrl, parseMontalvoOccurrencePage } from "./montalvoOccurrence.mjs";

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

test("a free family-friendly showcase is distinct from checkout template text", () => {
  const parsed = parseMontalvoOccurrencePage(`
    <h1 id="tn-page-heading">4th Lowrider Art Showcase</h1>
    <p class="tn-event-detail__display-time">Sunday, Nov 1, 2026 1:00PM</p>
    <p class="tn-event-detail__description"><p>This free, family-friendly
      afternoon celebrates the lowrider community.</p></p>
    <div data-tn-price-amount="0.0000"></div>
    <aside>The amount must be greater than $10.00.</aside>`);
  assert.equal(parsed.cost, "free");
  assert.equal(parsed.kidFriendly, true);
  assert.equal(parsed.date, "2026-11-01");
  assert.equal(parsed.time, "1:00 PM");
});

test("explicit zero-price admission remains free without paid tickets", () => {
  const parsed = parseMontalvoOccurrencePage(`
    <h1 id="tn-page-heading">Community Festival</h1>
    <div data-tn-price-amount="0.0000"></div>`);
  assert.equal(parsed.cost, "free");
});

test("reserved-seat admission reads the current performance's ticket prices", () => {
  const page = (config) => `
    <link rel="canonical" href="https://my.montalvoarts.org/3107/3150">
    <h1 id="tn-page-heading">SOLAS</h1>
    <p class="tn-event-detail__display-time">Friday, Nov 6, 2026 7:30PM</p>
    <script>window.tnew.page.initialize(${JSON.stringify(config)});</script>`;
  const config = {
    syosConfig: {
      bestAvailablePath: "/3107/3150", performanceId: 3150,
      feeDisclaimers: { "1-36": "$61.00 ticket + $8.00 fees", "1-38": "$56.00 ticket + $8.00 fees" },
    },
  };
  assert.equal(parseMontalvoOccurrencePage(page(config)).cost, "paid");
  assert.equal(parseMontalvoOccurrencePage(page({
    syosConfig: { ...config.syosConfig, performanceId: 3151, bestAvailablePath: "/3108/3151" },
  })).cost, null, "another performance's prices do not establish this admission");
  assert.equal(parseMontalvoOccurrencePage(page({
    syosConfig: { ...config.syosConfig, feeDisclaimers: { donation: "Please donate $50.00" } },
  })).cost, null, "donations and generic checkout amounts are not ticket prices");
  assert.equal(parseMontalvoOccurrencePage(page({
    syosConfig: { ...config.syosConfig, feeDisclaimers: { "1-36": "$0.00 ticket + $0.00 fees" } },
  })).cost, "free");
  assert.equal(parseMontalvoOccurrencePage(page({
    syosConfig: { ...config.syosConfig, feeDisclaimers: { "1-36": "$61.00 ticket + $8.00 fees", child: "$0.00 ticket" } },
  })).cost, "paid", "a free-child tier cannot erase paid admission");
});

test("overview ticket selection rejects another clock, production, host, or ambiguous slot", () => {
  const page = (href, time = "7:30PM") => `
    <link href="https://my.montalvoarts.org/overview/3105" rel="canonical">
    <li class="tn-prod-list-item__perf-list-item"><a href="${href}">
      <span class="tn-prod-list-item__perf-date">Wednesday, Oct 28, 2026</span>
      <span class="tn-prod-list-item__perf-time">${time}</span></a></li>`;
  const event = { date: "2026-10-28", time: "7:30 PM" };
  assert.equal(findMontalvoPerformanceUrl(page("/3105/3148"), event), "https://my.montalvoarts.org/3105/3148");
  assert.equal(findMontalvoPerformanceUrl(page("/3105/3148", "9:30PM"), event), null);
  assert.equal(findMontalvoPerformanceUrl(page("/3107/3150"), event), null);
  assert.equal(findMontalvoPerformanceUrl(page("https://elsewhere.example/3105/3148"), event), null);
  assert.equal(findMontalvoPerformanceUrl(page("/3105/3148"), { ...event, date: "2026-10-29" }), null);
  assert.equal(findMontalvoPerformanceUrl(page("/3105/3148") + page("/3105/3149"), event), null);
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
