const ROUTINE_PERMIT = /\b(reroof|re-roof|roofing|roof replacement)\b/i;
const SIGN_PERMIT = /\b(?:sign|signage)\b/i;
const SUBSTANTIVE_PROJECT =
  /\b(?:addition|commercial|demolition|housing|mixed-use|new construction|office|residential|tenant improvement|units?)\b/i;

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
