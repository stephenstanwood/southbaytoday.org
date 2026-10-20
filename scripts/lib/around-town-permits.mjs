const ROUTINE_PERMIT = /\b(reroof|re-roof|roofing|roof replacement)\b/i;
const SIGN_PERMIT = /\b(?:signs?|signage)\b/i;
const SUBSTANTIVE_PROJECT =
  /\b(?:addition|commercial|demolition|housing|mixed-use|new construction|office|residential|tenant improvement|units?)\b/i;

/** Nonpositive or missing valuations are unavailable, not a reported $0. */
export function permitValuationForPrompt(permit) {
  const value = permit?.valuation;
  return Number.isFinite(value) && value > 0
    ? `declared permit valuation $${value.toLocaleString("en-US")}`
    : "permit valuation unavailable";
}

/** No supplied permit valuation establishes a zero-dollar project. */
export function hasUnsupportedZeroPermitValuation(item) {
  const text = `${item?.headline || ""} ${item?.summary || ""}`;
  return /\$\s*0(?:\.0+)?(?!\d|[.,]\d)|\b(?:zero[- ]dollar|zero)\s+(?:declared\s+|permit\s+)*valuation\b|\bvaluation\s+(?:(?:is|of|was)\s+)?zero\b/i.test(text);
}

/** Keep only permits that can support a substantive Around Town item. */
export function isAroundTownPermitCandidate(permit) {
  const description = String(permit?.description || "");

  if (ROUTINE_PERMIT.test(description)) return false;
  if (
    permit?.category === "entitlement" &&
    SIGN_PERMIT.test(description) &&
    !SUBSTANTIVE_PROJECT.test(description) &&
    !(permit?.valuation > 500_000) &&
    !(permit?.units > 0)
  ) {
    return false;
  }
  if (permit?.valuation > 500_000) return true;
  if (["residential-new", "commercial-large", "entitlement"].includes(permit?.category)) return true;
  return permit?.units > 0;
}
