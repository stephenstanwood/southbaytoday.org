import assert from "node:assert/strict";
import test from "node:test";

import { parseMontalvoOccurrencePage } from "./montalvoOccurrence.mjs";

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
