// ---------------------------------------------------------------------------
// poster-composition.mjs
//
// Composition axes for Recraft prompts. Each axis is sampled independently
// of the style so that two posters in the same style (e.g. "rainbow-stripes")
// can feel visually different because their layout / typography / accent /
// negative-space choices differ.
//
// Scale: ~6 × 5 × 6 × 4 × 4 = 2,880 combinations per style, × 20 styles =
// ~57,600 distinct looks. More than enough to kill same-y output.
// ---------------------------------------------------------------------------

const LAYOUTS = [
  {
    id: "stacked-vertical",
    hint: "Layout: vertical stacked blocks, one stop per horizontal band, reading top to bottom.",
  },
  {
    id: "asymmetric-off-grid",
    hint: "Layout: asymmetric — elements intentionally off-grid, some stops float left, others right, varied sizes.",
  },
  {
    id: "diagonal-flow",
    hint: "Layout: content flows diagonally across the page, with stop cards tilted slightly, creating movement from top-left to bottom-right.",
  },
  {
    id: "centered-axis",
    hint: "Layout: centered axis — all content anchored to a vertical center line, symmetrical feel, clean spine running through.",
  },
  {
    id: "cascading-cards",
    hint: "Layout: stop cards cascade down the page at slightly different widths, each overlapping the next by a hair, like shuffled index cards.",
  },
  {
    id: "gridded-modules",
    hint: "Layout: strict grid — stops in equal-size modules (3×2 or 2×3), clean dividers between cells, modernist.",
  },
];

const TYPOGRAPHY = [
  {
    id: "oversized-headline",
    hint: "Typography: one massive headline that dominates the top third of the poster, supporting text much smaller.",
  },
  {
    id: "condensed-allcaps",
    hint: "Typography: tight condensed all-caps throughout, with letter-spacing that's almost claustrophobic on headlines.",
  },
  {
    id: "mixed-scale-serif-sans",
    hint: "Typography: dramatic mix of a bold serif for headlines and a clean sans-serif for details, big scale differences.",
  },
  {
    id: "monospace-editorial",
    hint: "Typography: monospace typewriter-style face for times and metadata, a contrasting display face for venue names.",
  },
  {
    id: "hand-lettered-accent",
    hint: "Typography: primary face is clean sans-serif, but the lead word/phrase is hand-lettered in a loose script for a personal touch.",
  },
];

const ACCENTS = [
  { id: "scattered-dots", hint: "Decoration: small confetti dots and stars scattered sparsely in the margins and between sections." },
  { id: "horizontal-stripes", hint: "Decoration: thin horizontal color stripes between sections as dividers." },
  { id: "organic-blobs", hint: "Decoration: soft organic blob shapes in the background behind text sections, faintly suggesting landscapes." },
  { id: "geometric-shapes", hint: "Decoration: sharp geometric accents — triangles, circles, small squares — placed deliberately for rhythm." },
  { id: "collage-scraps", hint: "Decoration: collage-feel scraps of torn paper, washi tape strips, or ripped edges around section boundaries." },
  { id: "minimal-none", hint: "Decoration: no decoration — the layout and typography carry it; pure negative space does the work." },
];

const NEGATIVE_SPACE = [
  { id: "tight-dense", hint: "Density: packed and dense — information fills most of the frame, very little negative space." },
  { id: "breathing", hint: "Density: generous breathing room around headlines and between stops." },
  { id: "editorial-wide", hint: "Density: editorial wide margins, like a magazine spread, with the content column narrow relative to the page." },
  { id: "asymmetric-space", hint: "Density: intentionally asymmetric — dense on one side, airy on the other." },
];

// "Mood" pairs a warmth/energy bias with the chosen style — keeps things from
// feeling the same even when style + layout overlap.
const MOODS = [
  { id: "warm-inviting", hint: "Mood: warm and inviting — lean into approachable, friendly tones even if the base palette is cool." },
  { id: "electric-vibrant", hint: "Mood: electric and vibrant — push saturation, add movement and visual punch." },
  { id: "quiet-confident", hint: "Mood: quiet and confident — restrained, editorial, sophisticated." },
  { id: "playful-loud", hint: "Mood: playful and loud — embrace the chaos, let elements collide, energy over polish." },
];

function pickOne(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Sample a composition profile — one value from each axis.
 * Returns { hints: string (newline-separated), ids: object } so callers can
 * both prompt the model AND log which combination was used for the feedback
 * loop.
 */
export function sampleComposition() {
  const layout = pickOne(LAYOUTS);
  const typography = pickOne(TYPOGRAPHY);
  const accent = pickOne(ACCENTS);
  const negativeSpace = pickOne(NEGATIVE_SPACE);
  const mood = pickOne(MOODS);

  const hints = [layout.hint, typography.hint, accent.hint, negativeSpace.hint, mood.hint].join("\n");
  const ids = {
    layout: layout.id,
    typography: typography.id,
    accent: accent.id,
    negativeSpace: negativeSpace.id,
    mood: mood.id,
  };
  return { hints, ids };
}

/**
 * Lightweight composition profile for abstract (tonight-pick / wildcard)
 * images. Drops the text-centric axes (layout, typography) and keeps the
 * visual ones (accent, negative-space, mood).
 */
export function sampleAbstractComposition() {
  const accent = pickOne(ACCENTS);
  const negativeSpace = pickOne(NEGATIVE_SPACE);
  const mood = pickOne(MOODS);
  const hints = [accent.hint, negativeSpace.hint, mood.hint].join("\n");
  const ids = { accent: accent.id, negativeSpace: negativeSpace.id, mood: mood.id };
  return { hints, ids };
}

export const COMPOSITION_AXES = { LAYOUTS, TYPOGRAPHY, ACCENTS, NEGATIVE_SPACE, MOODS };
