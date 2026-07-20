import assert from "node:assert/strict";
import test from "node:test";

import { foodProfileFromName, inferFoodProfile } from "../generate-place-blurbs.mjs";

test("place blurb matching does not treat Barcelona or tapas as bar terms", () => {
  assert.equal(foodProfileFromName("Barcelona", ""), null);
  assert.deepEqual(
    inferFoodProfile({
      name: "Telefèric Barcelona Los Gatos",
      types: [
        "spanish_restaurant",
        "tapas_restaurant",
        "cocktail_bar",
        "bar",
        "restaurant",
      ],
    }, "Spanish restaurant"),
    {
      label: "Spanish restaurant",
      food: "tapas, paella, and Spanish plates",
    },
  );
});

test("place blurb matching still recognizes standalone beer and bar terms", () => {
  assert.equal(foodProfileFromName("Neighborhood Beer Garden", "")?.label, "beer bar");
  assert.equal(foodProfileFromName("Taps on Main", "")?.label, "beer bar");
  assert.equal(foodProfileFromName("The Corner Bar", "")?.label, "bar and grill");
});

test("embedded nightlife substrings do not match", () => {
  assert.equal(foodProfileFromName("Shahi Darbar Indian Cuisine", ""), null);
  assert.equal(foodProfileFromName("Fairchilds Public House", ""), null);
});
