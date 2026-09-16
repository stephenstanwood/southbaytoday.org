# September 16 issue QA — pancakes at a coffee shop that has none

Scope: the September 16, 2026 daily issue's morning plan card, which paired
the Mount Umunhum hike with "eggs and pancakes at Blvd Coffee of Almaden".
The sent issue at `southbaytoday.org/newsletters/2026-09-16` was not
rewritten; corrections land in source data and the generator.

## What shipped, and what the venue serves

Verified September 16, 2026 against the venue's own menu,
[blvdcoffee.com/our-menu](https://blvdcoffee.com/our-menu/): bagels, egg
sandwiches, a two-egg Breakfast Plate, crepes, sandwiches and espresso. No
pancakes. The card copy came from a template row in
`src/data/south-bay/place-blurb-cache.json`:

> San Jose breakfast and brunch spot for eggs, pancakes, and brunch plates on
> Meridian Ave.

That row was corrected by hand first (PR #248, `source: "verified"`):

> San Jose coffee shop and bakery for coffee, bagels, egg sandwiches, and
> crepes on Meridian Ave.

## Root cause

`scripts/generate-place-blurbs.mjs` profiled food venues off one haystack of
name + every Google type. Google tags coffee shops, bakeries, donut and ice
cream shops with a secondary `breakfast_restaurant` liberally, and the
breakfast rule sat ahead of the cafe, bakery and dessert rules, so the
secondary tag beat the primary type. The same rule carried `creamery` as a
breakfast token, and its copy asserted a dish ("eggs, pancakes, and brunch
plates"). 41 cached rows carried the pancake claim, among them Happy Donuts,
Cold Stone Creamery, Tous Les Jours, Coupa Cafe and The Coffee Shack.

## What changed

- `inferFoodProfile` now lets the name + Google's **primary** type answer
  before any secondary tag enters the haystack, when the name tier recognises
  that primary type or it is generic (`restaurant`/`food`). A cuisine only the
  type tier knows (`chinese_restaurant`, `greek_restaurant`) keeps the old
  path, so a generic name word ("Asian Street Cafe") cannot beat the cuisine.
- Breakfast copy is claim-free in both tiers: "eggs, breakfast plates, and
  brunch dishes". `creamery` moved to a new ice cream rule ("ice cream and
  frozen treats") ahead of the tea/dessert rule, so scoop shops are no longer
  promised "tea drinks" either. A cocktail rule ("cocktails and bar snacks")
  sits ahead of the generic bar rule, which had been promising burgers at
  cocktail lounges.
- Rows marked `source: "verified"` survive regeneration untouched; the Blvd
  Coffee row is carried forward byte-for-byte. Without it the fixed rule now
  yields "cafe for coffee, pastries, and cafe bites" for that venue.
- Cache regenerated. 129 rows changed, every one checked against the venue's
  primary type: the 41 pancake rows (26 re-profiled as cafe/bakery/ice
  cream/sandwich/beer garden, 15 brand-name or breakfast-primary venues keep
  the breakfast profile with the new wording), 44 sibling rows where a
  secondary tag had beaten the primary type (eleven Paris Baguette locations
  as "sandwich shop"/"cafe", eight tea houses as cafes, Barebottle Brewing
  as a cafe), 35 ice cream shops, 9 cocktail bars (Amandine Lounge checked against
  its own menu: cocktails, charcuterie, hummus — no desserts, no burgers).
- Ten rows the generator would also have touched are unrelated drift since the
  May 27 run — hand-edited art-studio blurbs and `arts`/`museum` category flips
  — and were left at their committed values. They will churn on the next full
  regeneration unless marked `verified`.

## Regression coverage

`scripts/lib/place-blurb-food.test.mjs`: a coffee shop and a cafe with a
secondary `breakfast_restaurant` tag profile as cafe; a donut shop and a bakery
with the same tags stay bakery; "… Creamery" ice cream and dessert shops are
ice cream; Holder's Country Inn, Orange Bowl, Breaking Dawn Brunch and a
brunch-primary Sweet Maple keep the breakfast profile; the breakfast copy
contains no "pancake"; a Chinese-restaurant primary named "Cafe" keeps its
noodle profile; a cocktail bar is cocktails and bar snacks. `npm test` (1029
passing) and `npm run validate-places` both green.

## Left alone

The three editorial rows that legitimately mention pancakes (Liang's Village
beef pancakes, The Original Pancake House, Holder's Mission City Grill) are
Google's own summaries and were not touched.
