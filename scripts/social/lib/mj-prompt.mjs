// Midjourney prompt distillation — shared between copy-review-server.mjs
// (interactive regen + per-approve pregen) and generate-schedule.mjs (weekly
// batch). Centralizing here so the prompt instructions and style pool can't
// drift between the two call sites.
//
// Style pool mirrors scripts/social/lib/poster-styles.mjs ABSTRACT_AESTHETICS,
// rephrased without internal commas so MJ permutation parsing stays clean.
// Two-pool system: 10 from geometric + 5 from variety, then shuffled. ~67%
// abstract/geometric, ~33% wild variety.
//
// Rules for entries:
// - No internal commas (MJ permutation parser splits on them).
// - No living-artist names (filter risk). Dead artists / movements OK.
// - No psychedelic/kaleidoscope/tie-dye/melting (Stephen's standing rule).
// - Each entry should produce a visually distinct register in MJ.

import { spawn } from "node:child_process";

const MJ_STYLES_GEOMETRIC = [
  "Op Art Vasarely moire optical illusion stark contrast",
  "hard-edge painting flat sharp geometric color blocks crisp",
  "Albers homage to the square nested color squares perception",
  "Frank Stella protractor concentric stripes geometric",
  "Sol LeWitt grid systematic wall drawing permutation",
  "Agnes Martin gentle horizontal grid soft graphite quiet",
  "Rothko color field soft rectangles ethereal scale meditative",
  "Donald Judd minimalist box geometry industrial",
  "concrete art swiss geometric pure abstraction",
  "geometric abstraction crisp shapes pure color modernist",
  "abstract expressionism gestural brushwork vivid color blocks",
  "color field painting large flat saturated planes meditative scale",
  "Bauhaus geometric primary shapes structured grid",
  "De Stijl primary rectangles black lines mondrian grid",
  "Cubist faceted planes multiple viewpoints geometric fragmentation",
  "Suprematist floating geometric shapes white void minimalist",
  "Futurist motion lines diagonal energy speed dynamic",
  "Vorticist sharp angular machine-age british modernism",
  "constructivist poster diagonal composition red black and cream",
  "Russian avant-garde rodchenko diagonal red typography revolutionary",
  "Bauhaus typography poster sans-serif primary blocks geometric",
  "Swiss International Style helvetica grid clean asymmetric",
  "linocut block print carved texture visible grain 2-3 inks indie feel",
  "woodcut bold black lines stark white space german expressionist",
  "risograph print grainy texture 2-color overprint zine energy",
  "screen print poster halftone dots limited 3-color palette retro",
  "cyanotype blueprint single-tone deep blue ink wash",
  "Islamic geometric tile tessellation interlocking pattern",
  "sacred geometry mandala precise compass shapes meditative",
  "Persian rug pattern ornate central medallion rich jewel tones",
  "mosaic tessellated stones byzantine gold leaf saturated",
  "stained glass leaded outline jewel-tone color blocks rich saturation",
  "terrazzo pattern cream field scattered small stone chips muted accents",
  "Adinkra stamped pattern earth tones west african symbol",
  "Andean textile geometric warp weft alpaca palette",
  "Aboriginal Australian dot painting tessellated landscape symbolic",
  "Navajo blanket geometric stripes warm earth palette",
  "quilt patchwork geometric blocks faded country fabric",
  "sashiko indigo blue running stitch repair pattern japanese",
  "shibori indigo resist dye organic fold pattern hand-dyed",
  "block print fabric repeating motif handmade indigo textile",
  "Indian Madhubani folk pattern bold outline natural pigments",
  "mola textile applique reverse stitching bold tropical pattern",
  "mid-century jazz album cover blue note bold typography rhythm",
  "art deco travel poster stepped geometry chrome lines rich teal and gold",
  "WPA mid-century travel poster stylized geometry limited palette",
  "Saul Bass film poster bold silhouettes flat shapes stark contrast",
  "Memphis design squiggles confetti dots 80s bold pastels playful",
  "isometric flat illustration architectural spatial depth",
  "minimal line art bold color fills large color fields",
  "Scandinavian minimal generous whitespace muted earth tones thin lines",
  "brutalist raw concrete typography unpolished anti-design",
  "chromatic aberration glitch RGB channel offsets scanlines digital grain",
  "dazzle camouflage geometric bold black white shapes",
  "pixel art 8-bit grid limited palette retro digital",
  "wireframe blueprint geometric architecture line drawing",
  "topographic contour lines abstract landscape pattern",
];

const MJ_STYLES_VARIETY = [
  "watercolor translucent wash bleeding edges paper texture wet-on-wet",
  "gouache painterly texture muted vintage palette",
  "oil impasto thick textured strokes rich post-impressionist",
  "tempera flat matte egg-yolk binder medieval icon vivid pigment",
  "fresco wall painting muted lime-plaster faded pompeii antique",
  "encaustic wax painting layered translucent dimensional surface",
  "fauvist wild color non-realistic palette emotional intensity",
  "pointillism dotted color separation optical mixing scientific",
  "tonalism muted atmosphere soft fog quiet contemplation",
  "luminism quiet glow detailed landscape transcendent light",
  "plein air impressionist quick brushwork outdoor light dappled",
  "ashcan school gritty urban earth tones early 20th century",
  "sumi-e ink wash rice-paper cream broad black brushstrokes single red seal accent",
  "etching crosshatch sepia heavy outline antiquarian feel",
  "drypoint scratched copperplate dark ink subtle gradient",
  "mezzotint velvety dark tones gradual fades atmospheric mystery",
  "lithograph chalk crayon rough drawing muted earth tones",
  "stencil street art spray paint stark contrast bold silhouette",
  "monoprint painterly transfer texture single impression spontaneous",
  "Dada collage typography fragmented absurd",
  "Surrealist dreamlike juxtaposition unexpected scale collage absurdist humor",
  "Czech functionalist restrained typography geometric book cover",
  "art nouveau organic curves whiplash lines decorative borders",
  "arts and crafts honest materials nature-inspired ornament",
  "Vienna Secession Klimt gold leaf decorative pattern",
  "illuminated manuscript medieval marginalia gold ink decorative",
  "icon painting byzantine gold leaf stylized halos religious",
  "Russian lacquer miniature gold detail black background fairy tale",
  "tarot card baroque ornamental border symmetrical iconography",
  "Victorian botanical illustration meticulous engraving plant detail",
  "Edwardian theater poster ornate typography muted gilt",
  "Japanese ukiyo-e woodblock flat color fields delicate ink line",
  "Hokusai dynamic wave landscape compositional power",
  "Korean minhwa folk painting flat colors symbolic motifs cheerful",
  "Chinese gongbi meticulous brush detail traditional symbolic",
  "Persian miniature delicate detail gold leaf jewel tones manuscript",
  "Mughal garden painting elaborate detail architecture refined",
  "Mexican papel picado cut paper banner festive primary colors",
  "Maori koru spiral curvilinear pattern earth ochre",
  "Inuit stonecut print bold silhouette arctic palette",
  "mid-century modern organic curves muted warm palette atomic-era",
  "Saul Steinberg single-line drawing whimsy intellectual cartooning",
  "Milton Glaser bold curved typography flat color 60s poster",
  "Push Pin Studios flat illustration sophisticated 60s graphic",
  "Polish poster school surreal expressive 60s illustration",
  "Cuban screen-print poster bold limited color graphic energy",
  "Czech film poster surreal hand-drawn melancholic 60s",
  "Lichtenstein ben-day dots comic panel thick outline pop",
  "Warhol silkscreen flat color repeated icon pop",
  "paper cut collage layered flat shapes subtle shadows craft feel",
  "Matisse cut-paper bold organic shapes clean edges joyful flat color",
  "kintsugi gold-mended cracks broken pottery imperfect repair",
  "embroidery thread texture stitched outline tactile fabric",
  "weaving warp-weft texture earth-tone yarn dimensional grid",
  "vintage zine collage torn paper xerox grain DIY punk energy",
  "editorial magazine wide margins single bold accent color sophisticated restraint",
  "folk art naive style hand-drawn whimsical bright colors",
  "California redwood and fog-gray landscape abstraction stylized hills golden hour",
  "Hudson River School luminous landscape transcendent vista 19th century",
  "Japanese minimalist landscape negative space distant mountains haze",
];

function mjShuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function mjSampleStyles() {
  const g = mjShuffle(MJ_STYLES_GEOMETRIC).slice(0, 10);
  const v = mjShuffle(MJ_STYLES_VARIETY).slice(0, 5);
  return mjShuffle([...g, ...v]);
}

const CLAUDE_CLI = process.env.CLAUDE_CLI_PATH || "/opt/homebrew/bin/claude";

// Shell out to Claude Code in print mode — uses Stephen's subscription auth
// (keychain) rather than the API. Runs with cwd=/tmp so it doesn't load this
// project's CLAUDE.md.
async function callClaudeCodeOpus(instructions, timeoutMs = 90_000) {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let done = false;
    const finish = (err, val) => { if (done) return; done = true; err ? reject(err) : resolve(val); };
    const proc = spawn(CLAUDE_CLI, [
      "-p",
      "--model", "opus",
      "--output-format", "text",
      "--no-session-persistence",
    ], { cwd: "/tmp", timeout: timeoutMs });
    proc.stdout.on("data", (d) => { stdout += d.toString(); });
    proc.stderr.on("data", (d) => { stderr += d.toString(); });
    proc.on("error", (err) => finish(new Error(`claude CLI spawn failed: ${err.message}`)));
    proc.on("close", (code, signal) => {
      if (signal) return finish(new Error(`claude CLI killed by ${signal} (likely timeout)`));
      if (code !== 0) return finish(new Error(`claude CLI exit ${code}: ${(stderr || stdout).slice(0, 300)}`));
      finish(null, stdout);
    });
    proc.stdin.end(instructions);
  });
}

async function distillMjSubject(slot, slotType) {
  const copy = (slot && slot.copy && (slot.copy.x || slot.copy.bluesky || slot.copy.threads || slot.copy.facebook || slot.copy.instagram || slot.copy.mastodon)) || "";
  const cardLine = (slotType === "day-plan" && Array.isArray(slot?.plan?.cards) && slot.plan.cards.length)
    ? `\nSTOPS IN THE DAY PLAN: ${slot.plan.cards.map((c) => c?.name).filter(Boolean).join(", ")}`
    : "";

  const instructions = `You are crafting a Midjourney image-prompt SUBJECT for South Bay Today — a hyperlocal Bay Area community publication. The user has a "Copy MJ" button to upgrade the auto-generated image into something handmade and beautiful via Midjourney.

The post you're working from:
"""${copy}"""${cardLine}

Your output will be wrapped in a permutation of 5 abstract design styles (Bauhaus / Matisse cut-paper / linocut / risograph / art deco / sumi-e / etc.) and submitted to Midjourney. So your subject needs to play nicely with those styles — think gallery-grade still life, atmospheric landscape, and material-rich vignette.

═══ PRINCIPLES ═══

1. STRIP every proper noun. No city names, no venue names, no instructor or performer or team or brand names. Strip all times, dates, prices, RSVP details. Strip editorial filler ("nice way to land into the week", "low-key", "easygoing vibe", "genuinely"). What's left is the EXPERIENCE itself.

2. Translate the experience into 3-4 SENSORY ANCHORS. For each anchor, ask: what would I SEE, what's the LIGHT like, what MATERIALS or TEXTURES are in the room, what COLORS dominate, what's the MOOD? Each anchor is a short visual fragment — 3-6 words each.

3. Each fragment is a self-contained still life or atmospheric vignette. UNUSUAL PAIRINGS beat literal description. "candlelight pooling on rice paper" beats "person meditating". "stadium lights bleeding into pink dusk" beats "people watching baseball."

4. BIAS toward still life, materials, light, atmosphere, and landscape. AVOID verbs that imply human figures in motion — the final image excludes people. If the event involves people doing something, describe the OBJECTS and LIGHT around the activity instead.

5. Concrete details that imply mood. Not "warmth" — "amber light pooling on brass". Not "energy" — "dust caught in late-afternoon sunbeams". Not "calm" — "the hush of a book closing in soft amber". The mood emerges from specific things.

6. Match the event's visual REGISTER:
   - meditation / quiet / library → hush, soft amber light, breath, paper, cloth, dimness
   - music → instruments, smoke, low warm glow, light-as-sound metaphors
   - food → glossy textures, steam, plates, knife-edges of color, glassware
   - sports → kinetic granularity, stadium light, paint stripes, leather grain, foam
   - hike / outdoor → topography, weather, hour-of-day, distant haze, grass
   - markets / fairs → tables of color, paper bags, awnings, midday glare
   - kids / family events → primary colors, simple shapes, warm domestic light

7. ART-CONTENT EVENTS (exhibitions, gallery shows, art classes, art workshops, museum visits, theater, dance, performance, open studios): the subject must render the ART ITSELF — the medium, materials, mark-making, color register, gesture. NEVER render the display setting (gallery walls, framed pieces, museum interiors, plinths, audiences, stages). Translate the art into its essential materials and actions: ink brush curves, watercolor washes, paper-cut petals, palette-knife smears, gold leaf flakes, photographic emulsion, stage light spilling across velvet, calligraphy on cream paper. If the event has a CULTURAL register (AANHPI, Latinx, Black History, etc.), use that culture's visual heritage in materials and color (indigo, persimmon, jade for East Asian; cochineal, marigold, turquoise for Mexican folk; cobalt, ochre, ivory for West African; etc.).

8. Total length: 14-26 words across 3-4 fragments. Tight. Each word earns its place.

═══ EXAMPLES (study the bar) ═══

POST: "Tonight in Los Altos: 20 min guided meditation at Woodland Library, 7 PM, free"
SUBJECT: candlelight pooling on rice paper, a single dropped magnolia petal, the hush of a book closing in soft amber

POST: "Jazz trio tonight at Cafe Stritch, 7pm, \$20 cover. Easygoing vibe + cocktails"
SUBJECT: brushed cymbals catching low amber, the curve of an upright bass against deep velvet, smoke unfurling toward a dim doorway

POST: "Friday in the South Bay: bagels in Mountain View, hike the Dish, Cantor Arts Center, ramen dinner"
SUBJECT: steam rising off a cross-cut bagel, golden grass over coastal hills, marble torso turning in slow gallery light, glossy noodles caught in chopstick tension

POST: "Tonight: SJ Giants vs Fresno Grizzlies at Excite Ballpark, first pitch 7pm"
SUBJECT: stadium lights bleeding into pink dusk, the white seam of a thrown baseball, foam spilling from a paper cup, peanut shells on poured concrete

POST: "Now open: new ramen spot in Mountain View, Sunday opening special"
SUBJECT: clouded broth in a hand-thrown bowl, neon kanji washed onto rain-slick pavement, glossy noodles caught in chopstick lift

POST: "Free flower drawing workshop at Los Altos Library — beginners welcome"
SUBJECT: bare graphite lines branching into a daisy, a tin of colored pencils tipped open, dried botanicals pressed under glass, late-morning library light

POST: "Board game night at Milpitas Library, Friday 6pm, free, all ages"
SUBJECT: scattered wooden meeples in lamplight, the glossy edge of a card mid-shuffle, dice frozen mid-roll on worn felt

POST: "Saturday symphony at Mountain Winery — outdoor amphitheater, 7:30pm"
SUBJECT: distant stage glow against eucalyptus silhouettes, brass instruments catching the last orange light, vineyard rows fading into purple haze

POST: "Sunday: pop-up plant market at the corner of Castro and Dana, 10-2"
SUBJECT: terra-cotta lined up on weathered wood, ferns spilling sideways in midday glare, hand-written tags fluttering, paper bags folded at the edge

POST: "AAPI Teen Art Exhibition at Saratoga Library, free through May, honoring AANHPI Heritage Month"
SUBJECT: overlapping watercolor washes in indigo persimmon and jade, a single calligraphy stroke ascending, gold leaf flakes drifting across cream paper, palette-knife dabs of plum and citron

POST: "Open studio night Friday — local painters showing new work + free wine"
SUBJECT: wet oil dragged across rough canvas, a thumbprint smudge of cadmium red, charcoal lines cutting through underpainting, palette piled with glossy ridges

POST: "Saturday flamenco performance at Mexican Heritage Plaza, 8pm"
SUBJECT: marigold ruffles caught mid-twirl, fingertip-smudged castanets, deep cochineal velvet folding into shadow, a single staccato heel-strike at the floor's edge

═══ OUTPUT FORMAT ═══

Return ONLY the subject phrase. Single line. No quotes, no preamble, no markdown, no "Subject:" prefix, no explanation, no trailing period.`;

  const raw = await callClaudeCodeOpus(instructions);
  let subject = raw.trim();
  subject = subject.replace(/^```[\w]*\s*|\s*```\s*$/g, "");
  subject = subject.split("\n").filter((l) => l.trim()).pop() || "";
  subject = subject.replace(/^(SUBJECT|Subject|subject)[:：]\s*/u, "");
  subject = subject.replace(/^["'“‘`]+|["'”’`]+$/g, "");
  subject = subject.replace(/[.。]$/, "");
  subject = subject.trim();
  if (!subject) throw new Error("Opus returned empty subject");
  return subject;
}

export async function buildMjPromptForSlot(slot, slotType) {
  const subject = await distillMjSubject(slot, slotType);
  const styles = mjSampleStyles();
  // Style LEADS the prompt — putting the long descriptive subject first makes
  // MJ interpret it as a photographic scene and treat the style as background
  // decoration. Leading with `{style} of <subject>` forces MJ to read the
  // style as the medium. Anti-photo negatives in --no shut down lingering
  // photorealism / gallery wall framing.
  return `{${styles.join(", ")}} of ${subject}, flat graphic illustration, abstract composition --ar 4:5 --no photograph, photo, photorealistic, realism, 3D render, render, framed art, gallery wall, museum interior, exhibition, art show, plinth, hanging artwork, stage, audience, text, words, letters, watermark, signature, logo, people, faces, hands`;
}
