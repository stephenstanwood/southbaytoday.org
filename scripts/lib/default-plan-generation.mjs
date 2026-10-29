import { normalizeName } from "../social/lib/normalizeName.mjs";

export const nextDate = date => {
  const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10);
};

// All four entries are one publication unit. A failed/capped subscription keeps
// the last published file and lets the existing Mini retry slots recover it.
export async function generateDefaultPlanSet({ today, previous = {}, generate, validate, enrich = async () => {} }) {
  const names = { adults: new Set(), kids: new Set() };
  for (const [key, plan] of Object.entries(previous.plans || {})) {
    for (const card of plan.cards || []) {
      const name = normalizeName(card.name);
      if (name) names[key.startsWith("kids") ? "kids" : "adults"].add(name);
    }
  }
  console.log(`[default-plans] variety seed: ${names.adults.size} adults + ${names.kids.size} kids`);
  const plans = {};
  for (const tomorrow of [false, true]) {
    for (const mode of ["adults", "kids"]) {
      const key = `${mode}${tomorrow ? ":tomorrow" : ""}`;
      const date = tomorrow ? nextDate(today) : today;
      const recentlyShown = [
        ...[...names[mode]].map(name => ({ name, daysAgo: tomorrow ? 2 : 1 })),
        ...(tomorrow ? plans[mode].cards.map(c => ({ name: c.name, daysAgo: 1 })) : []),
      ];
      const plan = await generate({ city: "campbell", scope: "regional", kids: mode === "kids", planDate: date, recentlyShown, noCache: true });
      const quality = validate(plan, new Set(), date);
      if (!quality.ok) throw new Error(`${key} failed quality: ${quality.reason}`);
      if (plan.editorialProvider !== "codex-subscription") throw new Error(`${key} did not use the Codex subscription`);
      await enrich(plan.cards);
      plans[key] = { ...plan, planDate: date };
    }
  }
  return { _meta: { generatedAt: new Date().toISOString(), generator: "generate-default-plans (codex-subscription)",
    selectionModel: "pillar-pairs-v1", planCount: 4 }, plans };
}
