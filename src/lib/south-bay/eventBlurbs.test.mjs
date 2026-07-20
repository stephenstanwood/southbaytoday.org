import assert from "node:assert/strict";
import test from "node:test";

import { extractAnthropicText } from "./eventBlurbs.mjs";

test("extracts the text block when adaptive thinking comes first", () => {
  const response = {
    content: [
      { type: "thinking", thinking: "" },
      { type: "text", text: '[{"i":1,"blurb":"Hear live jazz downtown."}]' },
    ],
  };

  assert.equal(
    extractAnthropicText(response),
    '[{"i":1,"blurb":"Hear live jazz downtown."}]',
  );
});

test("returns an empty string when a response has no text block", () => {
  assert.equal(extractAnthropicText({ content: [{ type: "thinking", thinking: "" }] }), "");
  assert.equal(extractAnthropicText(null), "");
});
