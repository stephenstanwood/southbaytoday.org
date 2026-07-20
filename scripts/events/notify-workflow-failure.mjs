#!/usr/bin/env node

import { catSignal } from "../lib/notify.mjs";

const repository = process.env.GITHUB_REPOSITORY || "southbaytoday.org";
const runUrl = process.env.GITHUB_SERVER_URL && process.env.GITHUB_RUN_ID
  ? `${process.env.GITHUB_SERVER_URL}/${repository}/actions/runs/${process.env.GITHUB_RUN_ID}`
  : "GitHub Actions";

await catSignal({
  key: "events-refresh-github-workflow",
  title: "Independent event refresh check failed",
  body: `${repository} could not complete its strict event refresh. ${runUrl}`,
});
