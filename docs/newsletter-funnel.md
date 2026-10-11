# Newsletter signup diagnostics

Instrumentation added October 11, 2026. Use Vercel Web Analytics custom events
for `southbaytoday-org`, grouped by `pageType` and `placement`:

| Event | Meaning |
| --- | --- |
| `Newsletter signup seen` | At least half of the form entered the viewport, once per mounted form. |
| `Newsletter signup submitted` | A browser-valid form was submitted; retries count as additional attempts. |
| `Newsletter confirmation sent` | Resend accepted the confirmation email after the contact was saved pending. This is not proof of inbox delivery. |
| `Newsletter confirmed` | A valid signed link successfully changed a known pending/inactive contact to subscribed. |
| `Newsletter signup error` | The browser saw a failed submission, with a bounded HTTP status or `network` reason. |

Page types: `home`, `event` (detail), `event-day` (dated calendar), `events`
(index), `city`, `newsletters`, `other`. Placements: `card`, `inline`, `minimal`.
The event-page footer uses `minimal`; its visibility event fires only when the
form is visible, including after its `client:visible` island hydrates.

Compare event-page traffic with `seen` to investigate whether readers reach the
footer; compare `seen` with `submitted` for interest, `submitted` with `sent`
for submission failures, and `sent` with `confirmed` for the email step.
For API queries, use `/v1/query/web-analytics/events/aggregate`, filter by
`eventName` and `eventData/pageType`, and group by `eventData/placement`.

These are aggregate diagnostics, not person-level cohorts. Repeated attempts,
different devices, blocked browser beacons, email scanners, and confirmations
outside the selected time window can affect the ratios. Allow up to the
seven-day confirmation lifetime before comparing a send window with its
confirmations. Ordinary repeat clicks on an already active contact do not
count again; simultaneous confirmations are not transactionally deduplicated.
If the contact-status lookup fails, activation still proceeds, but we skip the
conversion metric rather than guess. A returning unsubscribed reader who
confirms again is a reactivation and counts as a confirmation.

Attribution categories travel inside the signed confirmation link, so they
survive a switch of device. No email address, confirmation token, form contents,
or originating URL is included in custom event metadata. Server events use a
fixed `/newsletters` URL: the normal server SDK would include the current
confirmation URL and its sensitive query string. The transport follows
`@vercel/analytics/server` 2.0.1; check it when upgrading that dependency.
Server events only emit in production and fail without interrupting signup.
The existing `notrack` browser preference also suppresses server attribution
for that signup. Honeypots never send a confirmation or a successful-stage metric.

The old `Newsletter signup` event stopped at a successful form response. It
could include honeypot responses and was never an activation count. Do not
join it to the new stages as a continuous conversion series.

Routine `/analytics` reports omit subscriber counts and newsletter-growth
commentary. Use these diagnostics when investigating the signup experience.

Verification: `npm run test:newsletter-signup` covers signed attribution,
legacy links, provider failures, repeat confirmations, privacy, and opt-out.
