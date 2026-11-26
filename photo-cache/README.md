# Photo cache

`photos.southbaytoday.org`, Vercel project `sbt-photo-cache` (root directory
`photo-cache/`). It serves `/api/place-photo` for the site, which relays every
CDN miss here.

Vercel keys its CDN cache by deployment, and the site deploys many times a day.
Before this project existed, every deploy emptied the photo cache and each
photo was bought from Google again: in November 2026 that was 89% of the
Places photo bill. This project redeploys only when its sources change
(`ignore-build.mjs` compares `source-files.mjs`'s hash with the live
`/version.json`), so a cached photo lasts its full week.

- The code is the site's: `build.mjs` copies `src/lib/placePhoto.mjs`,
  `src/lib/photoCache.mjs` and `venue-photos.json` in. Change them in `src/`.
- A request without the `x-sbt-photo-secret` header gets 403 on a miss, so only
  the site can cause a Google download. Env: `GOOGLE_PLACES_API_KEY` (the South
  Bay Today server key) and `PHOTO_CACHE_SECRET`, matching the site's.
- The site falls back to its own loader if this project does not answer.

Details and measurement: `docs/place-photos.md`.
