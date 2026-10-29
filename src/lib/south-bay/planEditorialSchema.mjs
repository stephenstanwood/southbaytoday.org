// Common structured contract for the serving API and subscription CLI.
export const PILLAR_PAIR_SCHEMA = {
  type: "object", additionalProperties: false, required: ["pairs"], properties: {
    pairs: { type: "array", description: "Exactly three pairs: morning, afternoon, evening.", items: {
      type: "object", additionalProperties: false,
      required: ["pillarBucket", "pillarId", "pillarBlurb", "mealId", "mealBlurb"],
      properties: { pillarBucket: { type: "string", enum: ["morning", "afternoon", "evening"] },
        pillarId: { type: "string" }, pillarBlurb: { type: "string" }, mealId: { type: "string" }, mealBlurb: { type: "string" } },
    } },
  },
};
