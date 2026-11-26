# Place photos

`src/pages/api/place-photo.ts` serves the same photo URL contract to cards,
event pages, shared plans, and newsletter readers.
`src/lib/placePhoto.mjs` chooses the upstream source.

## What a photo costs, and the photo cache

Each Google photo download is billed (about $7 per 1,000 past the monthly free
tier, SKU "Places API Place Details Photos"). In November 2026 the bill grew to
about $17 a day although only a few hundred distinct photos were in use: 89% of
downloads repeated a photo already fetched that day. Vercel keys its CDN cache
by deployment (the key includes the deployment URL and is not configurable), and
the site deployed about 50 times a day, so every deploy emptied the photo cache.
Link-preview crawlers (Meta's above all) and a headless browser that loads the
site after each deploy did most of the re-buying.

Since then:

- **The photo cache.** `/api/place-photo` relays each canonical request to
  `photos.southbaytoday.org`, the separate Vercel project `sbt-photo-cache`
  (`photo-cache/README.md`). It redeploys only when its sources change, so a
  cached photo lasts its full week however often the site deploys. Shared code:
  `src/lib/photoCache.mjs`. If the cache does not answer, the site falls back to
  its own loader.
- **Previews and structured data use SBT's own cards.** `og:image` on event
  pages and shared plans, and the JSON-LD image that used to fall back to the
  venue photo, now use the event's own art, the city card or the site card
  (`src/lib/south-bay/shareCards.ts`). Pages still show the venue photo.
- **Google-side caps.** The Nearest Coffee project's quota allows 2,000 photo
  downloads a day and 60 a minute; past that Google answers 429 until midnight
  Pacific. A capped, refused or failing answer is a 503 with `no-store`, never a
  cached 404, so photos come back as soon as Google serves them again. A
  billing-account budget emails at 50%, 90% and 100% of $150 a month.
- **A key of its own.** SBT uses the "South Bay Today server key" in the Nearest
  Coffee project (the account was at Google's project limit); stanwood.dev keeps
  the original key. Billing → Reports → Group by API key splits spend by site.
- **Fewer deploys.** Automated fact-check and copy-edit commits deploy in
  batches (CLAUDE.md, "Deployment").

## Official venue images

`src/data/south-bay/venue-photos.json` maps a Google place ID to an image
published by that venue or its official operator. The registry records the
source page, publisher, actual pixel dimensions, verification date, and source
image hash. The repository contains links and provenance, not mirrored images.

Prefer a clear venue photograph over a logo, event poster, tour button, or
generic stock image. Verify the actual bytes and appearance before adding a
row. The image must fit within the loader's 8 MiB source limit. A thumbnail
must not be enlarged to replace a hero or structured-data image: the loader
requires both source dimensions to meet the requested dimensions, checks the
decoded image again, and crops before downsampling. Small official theatre
photos therefore serve small cards while larger placements still use Google.

Official sources get a short timeout. Missing files, HTML responses, changed
dimensions, decode errors, and network failures retain the Google fallback.
Successful official responses expose their provenance through the existing
`Link: <sourcePage>; rel="describedby"` header and
`X-SBT-Photo-Source: venue`. Event-specific art still takes precedence in
consumers that already provide it.

## Measure provider work

Vercel request logs distinguish CDN hits from origin misses. An origin miss is
not automatically a Google request: it can be an official image, a canonical
redirect, or a rejected request.

Runtime log events distinguish the actual work:

- `place-photo-google-request`: emitted immediately before each Google fetch;
  count these to include retries and failed attempts.
- `place-photo-upstream`: successful result with `source: venue` or
  `source: google-places`; this older event excludes failed attempts.
- `place-photo-venue-fallback`: an eligible official source failed, causing
  the request to continue to Google.
- `place-photo-cache-relay` (site): a site CDN miss relayed to the photo cache,
  with its `status` and the photo cache's own `cache` result (`HIT` costs
  nothing). The site response carries the same value as `X-SBT-Photo-Cache`.
- `place-photo-cache-fallback` (site): the photo cache was unreachable or
  refused, so the site's own loader answered.
- `place-photo-ref-refresh`: Google rejected an expired photo name (HTTP 400,
  "retrieve it from Places API endpoints"), so the loader asked Place Details
  for the place's current photos (field mask `photos` only) and, when
  `found` is true, served the first one under the same URL. The fresh name is
  used for that request only and never stored. Archived newsletters, shared
  plans and food tiles keep the names they were built with, so most of these
  come from old pages.

Events contain place IDs and dimensions, without API keys or photo tokens.
Use Vercel's request ID to join provider work to request records when diagnosing
cache misses or crawler traffic. Google calls now happen in the photo cache, so
count `place-photo-google-request` with `vercel logs --project sbt-photo-cache`;
the Pro plan keeps runtime logs for about 20 hours and request logs for 24. Keep account-level billing analysis outside
this repository. Compare equivalent time windows and deployments before
claiming measured savings; matching historical requests to a new official
source is an eligibility projection, not a billing result.

## Google content and refresh

A photo that is still missing after that lookup (the place is gone or has no
photos) answers 404 with `Cache-Control: public, max-age=3600, s-maxage=86400`,
so the CDN absorbs repeat requests for a day instead of re-asking Google.

The loader shares concurrent identical requests but retains no completed Google
photos or URLs. This source expansion does not change cache TTLs or add image
storage. Before changing Google-content caching or storage, check the current
[Places policies](https://developers.google.com/maps/documentation/places/web-service/policies),
[photo documentation](https://developers.google.com/maps/documentation/places/web-service/place-photos),
and [service terms](https://cloud.google.com/maps-platform/terms/maps-service-terms).
Photo names expire and are subject to restrictions; existing HTTP headers do
not establish permission to persist or redistribute Google's images.

The Mini's photo-reference refresh runs daily but skips a full refresh for
25 days, with pending and targeted repairs supported between full refreshes.
The separate health sentinel normally samples 20 Google photos per day before
retries. Keep those safeguards: the request traffic and actual provider attempts
are the useful measures of photo demand.

## Verification

Run `node --test src/lib/placePhoto.test.mjs src/lib/photoCache.test.mjs scripts/lib/photoref-health.test.mjs`.
For a source addition, also call the live loader without a Google key and inspect
the resized bytes. After deployment, check `X-SBT-Photo-Source`, image dimensions,
the provenance link, and a repeat request's `x-vercel-cache` on the canonical
production URL. Verify that oversized placements still return a Google image.
