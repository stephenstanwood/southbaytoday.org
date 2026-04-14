# Event Intake Pipeline — Handoff from Stoa Thread

This is a build spec. Stephen wants to replicate the Stoa "Lookout" inbound-email pipeline here at South Bay Today, but for extracting **community events** out of city newsletters and mailing lists, then publishing them to the site.

## What we're building

A system where Stephen subscribes city mailing lists to a dedicated inbound address (e.g. `in@lookout.southbaytoday.org` — mirror the Stoa subdomain pattern). A webhook catches each email, an LLM extracts structured events (title, date, location, description, link), and those events get added to SBT's site.

Think: "Saratoga Source E-Newsletter arrives, LLM pulls out '5 events this week', each becomes a row in events.json, the site re-renders."

## The working reference is Stoa

Stoa just shipped this exact pattern. The code is in `/Users/stephenstanwood/Projects/stoa.works`. Copy these files as the starting point:

- `src/pages/api/admin/lookout/intake.ts` — Resend webhook receiver with Svix verification + body-fetch from Resend API. Rename path to whatever SBT uses (e.g. `src/pages/api/admin/events/intake.ts`).
- `src/lib/lookout/storage.ts` — Vercel Blob + filesystem fallback. Pattern for reading/writing the events store. Copy and rename.
- `src/lib/lookout/types.ts` — Type definitions. Copy and adapt to SBT's Event type.
- `scripts/confirm-subscriptions.mjs` — Auto-clicks CivicPlus/NotifyMe confirmation emails. Copy as-is; works for any Resend inbox.

The Lookout pipeline architecture:

```
inbound email
  → Resend inbound on subdomain (MX record)
  → Resend POSTs email.received webhook (metadata only)
  → your /api/.../intake endpoint
     → verify Svix signature
     → fetch full body via GET https://api.resend.com/emails/receiving/{id}
     → pass to LLM extractor (gpt-4o-mini)
     → write extracted rows to storage
```

SBT's twist: instead of a classifier + drafter for outreach leads, you want an **event extractor** that returns `{ events: [{ title, startsAt, endsAt?, location, description, sourceUrl, sourceEmail }] }`. That's a single OpenAI call per email with a JSON response format.

## Critical Resend gotchas (learned the hard way on Stoa)

**Read these before touching Resend. Each one burned real time.**

1. **Webhooks are metadata-only.** `email.received` doesn't include body/headers/attachments. You MUST call `GET https://api.resend.com/emails/receiving/{id}` with a full-access API key and pull `text` + `html` fields.

2. **The endpoint path is `/emails/receiving/{id}` — NOT `/received-emails/{id}`.** Older llms.txt mentioned the wrong path. Getting this wrong returns confusing 405s.

3. **Resend webhooks do NOT follow HTTP redirects.** If your site has apex→www redirect (Vercel default), pointing the webhook at `https://southbaytoday.org/...` returns 307 and Resend gives up. **Use `https://www.southbaytoday.org/...` (the canonical hostname) in the webhook URL.**

4. **The default Resend API key is "send-only".** When you verify a sending domain, the auto-generated key is scoped to sending only. Fetching received emails returns 401 with `restricted_api_key`. Create a **Full access** key manually from the API Keys page and use that for both sending and receiving.

5. **Custom receiving domain + existing MX records = disaster.** If SBT's apex `southbaytoday.org` has any existing mail routing (Google Workspace, forwarders, etc), do NOT enable Resend receiving on the apex. Use a subdomain like `lookout.southbaytoday.org` or `events.southbaytoday.org`. Resend will show a "Existing MX records detected" warning — take it seriously.

## Setup checklist

**Resend dashboard (do this first):**
1. Domains → Add domain → `lookout.southbaytoday.org` (subdomain, not apex). Let Vercel auto-configure DNS.
2. On the new domain's Records tab, flip **Enable Receiving** → accept the MX record.
3. API Keys → create **Full access** key (not send-only). Save it.
4. Webhooks → Add Webhook:
   - Endpoint: `https://www.southbaytoday.org/api/admin/events/intake` (or whatever path)
   - Event: `email.received`
   - Copy the Svix signing secret.

**SBT repo:**
5. Copy the Stoa files listed above as a starting point.
6. Set these env vars in Vercel prod (and locally in `.env`):
   - `RESEND_API_KEY` = the full-access key
   - `RESEND_WEBHOOK_SECRET` = the Svix signing secret
   - `BLOB_READ_WRITE_TOKEN` = Vercel Blob token (create a new store for SBT)
   - `OPENAI_API_KEY` = same key Stoa uses (or a separate one, your call)
7. Build the event extractor: single `gpt-4o-mini` call with a JSON schema prompt, output an array of events.
8. Wire extractor output → Vercel Blob (or wherever SBT stores events).
9. Redeploy.

**Test end-to-end:**
10. Send a test email from the Resend send API to your inbound address (Stoa's `scripts/confirm-subscriptions.mjs` won't be needed yet — different workflow). Watch Vercel logs for `[intake]` entries.
11. Verify extracted events appear on the site.

**Then subscribe city mailing lists:**
12. Go to each city's NotifyMe / mailing list / newsletter signup page. Use the new inbound address.
13. Run `node scripts/confirm-subscriptions.mjs` (copied from Stoa) to auto-click CivicPlus batched confirmation emails.

## The event extractor prompt (suggested starting point)

```
You extract community events from city newsletter emails sent to South Bay Today.

Return strict JSON:
{
  "events": [
    {
      "title": "short descriptive event name",
      "startsAt": "ISO 8601 timestamp with timezone (America/Los_Angeles)",
      "endsAt": "ISO 8601 or null if not specified",
      "location": "venue/address if given, else null",
      "description": "1-2 sentence plain-English summary, no marketing fluff",
      "sourceUrl": "primary link for more info, if any",
      "cityName": "city this event is in (Campbell, Saratoga, etc)"
    }
  ]
}

Rules:
- Only return events with a concrete date. Skip "ongoing" classes, recurring weekly things unless the email is announcing a specific instance, and vague "coming soon" items.
- If the email has zero concrete events (e.g. it's a bid RFP notification, a council agenda, or a meeting invitation), return {"events": []}.
- Skip events already past today's date.
- Deduplicate within one email.
```

## What Stoa's pipeline has that SBT won't need

- Keyword filter (Stoa uses it to pre-screen before hitting the LLM; SBT processes every email, so skip)
- Classifier (Stoa decides if something is a pre-RFP opportunity; SBT just extracts events)
- Drafter (Stoa generates outreach; SBT doesn't need this)
- Discord DM notifier (Stoa DMs Stephen on high-fit leads; SBT doesn't need alerts on every event)
- Dashboard (Stoa has a password-protected lead tracker; SBT doesn't need one — events just go to the public site)

So the SBT version is actually simpler. It's: webhook → fetch body → LLM extract → write to blob/site.

## Files to NOT copy from Stoa

Do not copy these — they're Stoa-specific:
- `src/lib/lookout/classifier.ts`
- `src/lib/lookout/drafter.ts`
- `src/lib/lookout/keywords.ts`
- `src/lib/lookout/notifier.ts`
- `src/pages/admin/lookout.astro`

## Authoritative references

If you want to dig further before building:
- Stoa repo: `/Users/stephenstanwood/Projects/stoa.works`
- Stoa handoff doc (for context): `/Users/stephenstanwood/Projects/stoa.works/HANDOFF.md`
- Resend receiving intro: https://resend.com/docs/dashboard/receiving/introduction
- Resend custom domains: https://resend.com/docs/dashboard/receiving/custom-domains

## One more thing: the domain

Stephen is using `in@lookout.stoa.works` on Stoa. The pattern `in@lookout.[domain]` is clean — use the same shape here: `in@lookout.southbaytoday.org` or `events@lookout.southbaytoday.org`. Don't overthink the address — cities only ever type it into signup forms.
