import { SOCIAL_COPY_ENABLED } from "./constants.mjs";
// Stephen retired social posting. A stale cron, CLI or review-server caller
// must stop before loading credentials, scoring or generating any copy.
export function assertSocialGenerationEnabled() {
  if (!SOCIAL_COPY_ENABLED) throw new Error("SBT social copy generation is retired. Default plans use scripts/generate-default-plans.ts; civic ingestion and newsletters remain active.");
}
