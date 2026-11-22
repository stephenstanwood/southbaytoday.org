#!/usr/bin/env node

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { scheduledReviewWorkspace } from "../lib/scheduled-review-workspace.mjs";

export function seoWorkspace(options) {
  return scheduledReviewWorkspace({ ...options, task: "sbt-seo-sweep" });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(JSON.stringify(seoWorkspace({ action: process.argv[2], workspace: process.argv[3] }), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
