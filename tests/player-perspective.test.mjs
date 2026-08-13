import assert from "node:assert/strict";
import test from "node:test";

import { rewritePlayerReferences } from "../app/player-perspective.ts";

test("rewrites third-person player narration into second person", () => {
  assert.equal(
    rewritePlayerReferences(
      "Mira sits by the sandbox. A breeze catches Mira's hair while Mira traces a circle.",
      "Mira Vale",
    ),
    "You sit by the sandbox. A breeze catches your hair while you trace a circle.",
  );
});

test("rewrites a full player name in suggested actions", () => {
  assert.equal(
    rewritePlayerReferences("Mira Vale looks under the swing.", "Mira Vale"),
    "You look under the swing.",
  );
});
