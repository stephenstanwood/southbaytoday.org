import { BUCKET_ORDER, MEAL_BUCKETS } from "./buckets";
import { CITIES } from "./cities";
import { canonicalizeSharedPlan } from "./canonicalizeCard.mjs";

const CITY_NAMES = new Map(CITIES.map((city) => [city.id as string, city.name]));
const PT = "America/Los_Angeles";

function savedDate(plan: Record<string, any>): string | null {
  if (typeof plan.planDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(plan.planDate)) {
    const date = new Date(`${plan.planDate}T12:00:00Z`);
    if (Number.isFinite(date.getTime()) && date.toISOString().startsWith(plan.planDate)) return plan.planDate;
  }
  const created = new Date(plan.createdAt || "");
  return Number.isFinite(created.getTime())
    ? created.toLocaleDateString("en-CA", { timeZone: PT })
    : null;
}

function summarize(raw: Record<string, any>) {
  const plan = canonicalizeSharedPlan(raw);
  if (!plan) return null;
  // Match the page: one card per bucket, in display order. Historical files
  // sometimes contain extra cards in a bucket that the page never displays.
  const bucketCards = BUCKET_ORDER.map((bucket) => plan.cards.find((card) => card.bucket === bucket)).filter(Boolean);
  const cards = bucketCards.length ? bucketCards : plan.cards;
  const isActivity = (card: Record<string, any>) => card.bucket
    ? !MEAL_BUCKETS.has(card.bucket)
    : card.category !== "food";
  const ordered = [...cards.filter(isActivity), ...cards.filter((card) => !isActivity(card))];
  return { date: savedDate(plan), kids: Boolean(plan.kids), cards: ordered };
}

type Summary = NonNullable<ReturnType<typeof summarize>>;

function cardLabels(summary: Summary, withCity: boolean): string[] {
  return [...new Set(summary.cards.map((card) => {
    const city = CITY_NAMES.get(card.city) || String(card.city || "").replaceAll("-", " ");
    return withCity && city ? `${card.name} (${city})` : card.name;
  }))];
}

function distinctHighlights(labels: string[], peers: string[][]): string[] | undefined {
  // Prefer a real activity or meal over an opaque plan ID. A pair of names
  // distinguishes itineraries whose individual stops all recur elsewhere.
  const singles = labels.map((label) => [label]);
  const pairs = labels.flatMap((label, index) => labels.slice(index + 1).map((other) => [label, other]));
  let fallback: string[] | undefined;
  for (const candidates of [singles, pairs]) {
    const unique = candidates.filter((candidate) => peers.every((peer) => !candidate.every((label) => peer.includes(label))));
    // Keep full place/event names, choosing a shorter alternative when one
    // exists instead of chopping off the words that distinguish two plans.
    const concise = unique.find((candidate) => candidate.join(" + ").length <= 52);
    if (concise) return concise;
    fallback ||= unique[0];
  }
  return fallback;
}

/** Read-time metadata covers historical records and every shared-plan writer
 * without changing stored plans, IDs, dates, or canonical URLs. Peers should
 * contain the other saved records, excluding the current record. */
export function sharedPlanMetadata(raw: Record<string, any>, peers: Record<string, any>[] = []) {
  const plan = summarize(raw);
  if (!plan) throw new TypeError("Shared-plan metadata requires a renderable plan");
  const siblings = peers.map(summarize).filter((peer): peer is Summary => peer !== null
    && peer.date === plan.date && peer.kids === plan.kids);
  const labels = cardLabels(plan, false);
  const highlights = distinctHighlights(labels, siblings.map((peer) => cardLabels(peer, false)))
    || distinctHighlights(cardLabels(plan, true), siblings.map((peer) => cardLabels(peer, true)))
    // Identical saved itineraries can honestly share metadata. Do not invent
    // differences or use this metadata helper to consolidate their URLs.
    || labels.slice(0, 2);
  const headline = highlights.join(" + ");
  const date = plan.date ? new Date(`${plan.date}T12:00:00Z`) : null;
  const shortDate = date?.toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });
  const dateLabel = date?.toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const titleCore = `${plan.kids ? "Family day plan: " : ""}${headline}${shortDate ? ` — ${shortDate}` : ""}`;
  const title = titleCore.length + " — South Bay Today".length <= 70 ? `${titleCore} — South Bay Today` : titleCore;

  const descriptionStart = `South Bay ${plan.kids ? "family " : ""}day plan${shortDate ? ` for ${shortDate}` : ""}: `;
  const descriptionStops = [...highlights];
  for (const label of labels) {
    if (highlights.some((highlight) => highlight === label || highlight.startsWith(`${label} (`))) continue;
    const candidate = [...descriptionStops, label];
    if (`${descriptionStart}${candidate.join("; ")}.`.length <= 165) descriptionStops.push(label);
  }
  const description = `${descriptionStart}${descriptionStops.join("; ")}.`;
  return { title, description, headline, dateLabel, planDate: plan.date };
}
