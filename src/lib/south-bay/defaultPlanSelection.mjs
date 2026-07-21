/**
 * Pick a pre-generated plan by the date recorded inside the plan, never by the
 * key it happened to occupy when the nightly job ran. After midnight,
 * `adults:tomorrow` may be today's only valid plan; conversely, `adults` may
 * still describe yesterday and must not be presented as current.
 */
export function selectDatedDefaultPlan(plans, date, { kids = false } = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) return null;
  const prefix = kids ? "kids" : "adults";
  const candidates = Object.entries(plans || {})
    .filter(([key, plan]) =>
      (key === prefix || key.startsWith(`${prefix}:`))
      && Array.isArray(plan?.cards)
      && plan.cards.length > 0)
    .map(([, plan]) => plan);

  return candidates.find((plan) => plan.planDate === date) || null;
}

/**
 * Deterministic build-time selection for React SSR. This intentionally reads
 * the named current-plan slot without consulting the clock; a post-mount pass
 * replaces it with selectDatedDefaultPlan() for the visitor's real PT date.
 */
export function selectNamedDefaultPlan(plans, { kids = false } = {}) {
  const prefix = kids ? "kids" : "adults";
  for (const key of [prefix, `${prefix}:h9`]) {
    const plan = plans?.[key];
    if (Array.isArray(plan?.cards) && plan.cards.length > 0) return plan;
  }
  return null;
}
