# Day-plan selection contract

South Bay Today day plans use the `pillar-pairs-v1` model. A plan is not a
six-stop route. It is three independent recommendations:

1. the best morning activity, paired with breakfast nearby;
2. the best afternoon activity, paired with lunch nearby;
3. the best evening activity, paired with dinner nearby.

## Selection order

Activity quality is decided before meal quality or geography. The planner
scores the full eligible event/place pool, keeps separate finalist lanes for
dated events and evergreen places, and asks the editorial model to choose one
pillar for each part of the day. The three pillars can be in any South Bay
towns; no score rewards clustering them or building a route.

The editor compares pillars before considering their attached restaurant
lists. A meal must be a real dine-in venue, open during the relevant service,
and no more than 5 miles from its pillar; 3 miles is preferred. Inside that
ceiling, quality beats small distance differences. Meal quality combines
rating evidence, editorial curation, verified new-opening status, cuisine/type
distinctiveness, and specific source-backed copy. A chain is eligible only
when the specific branch has a verified interest signal: a new opening,
distinctive format/cuisine, standout branch reputation, or a specific
editorial note. Eligible chains still carry an ubiquity penalty, so a familiar
logo does not beat an equivalent independent. Caterers, grocery stores,
food-delivery businesses, home food businesses, and meal-inappropriate venue
types are not eligible.

The radius must be supported by exact place coordinates or a matched venue.
An event known only to a city centroid stays in the event corpus but cannot be
used for a proximity pair.

Food events, such as a farmers market or festival, may be activity pillars.
Only restaurant/place records can fill meal buckets.

## Scopes

- `scope: "regional"` is the homepage, newsletter, graphics, scheduled hero,
  and event "Make it a day" default. The request's `city` is only a stable
  Campbell weather context.
- `scope: "city"` is used by `/city/<slug>` and hard-filters every pillar and
  meal to that city while retaining the same quality-first method.

## Durable card shape

Every new plan returns six cards and `selectionModel: "pillar-pairs-v1"`.
Activity cards have `role: "pillar"`; meal cards have
`role: "paired-meal"`. Both carry reciprocal `pairedWithId` values. Meal cards
also carry `pairDistanceMiles` and `pairLocationPrecision`. The latter records
whether the radius used exact place coordinates or a matched venue.

The contract is atomic. Newsletter filtering, homepage time-based aging,
shared-plan canonicalization, schedule review, and manual review tooling must
never remove or swap one card from a pair. A bad or stale card removes its
partner too, or rejects/regenerates the whole plan at generation boundaries.

## Main implementation points

- `src/pages/api/plan-day.ts`: regional/city pools, scoring, finalist lanes,
  editorial selection, lock handling, and pair construction.
- `src/lib/south-bay/dayPlanPairs.ts`: distance, meal quality, pair constants,
  and structural validation.
- `src/lib/south-bay/editorialQuality.mjs`: shared marquee, title-quality, and
  routine-event signals.
- `scripts/social/generate-schedule.mjs`: nightly adults/kids today/tomorrow
  hero generation; never rotates an anchor city.
- `scripts/newsletter/lib.mjs`: atomic validation and pillar-first rendering.
- `scripts/social/lib/poster-styles.mjs`: three paired graphic modules with
  activity-first hierarchy.

## Verification

Run `npm run test:plan-day`, the newsletter/post-generation/poster tests, and
`npm run build`. For a live check, POST to `/api/plan-day` in both regional and
city scopes and confirm all three reciprocal pairs, meal distances at or below
5 miles, and exact-city output for city scope.
