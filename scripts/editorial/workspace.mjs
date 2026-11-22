#!/usr/bin/env node

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { scheduledReviewWorkspace } from "../lib/scheduled-review-workspace.mjs";

export function editorialWorkspace(options) {
  if (!["sbs-fact-check", "sbs-copy-edit"].includes(options.task)) {
    throw new Error("Use sbs-fact-check or sbs-copy-edit.");
  }
  return scheduledReviewWorkspace(options);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [, , action, task, workspace] = process.argv;
  try {
    console.log(JSON.stringify(editorialWorkspace({ action, task, workspace }), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = error.exitCode ?? 1;
  }
}
