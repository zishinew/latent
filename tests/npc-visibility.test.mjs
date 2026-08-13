import assert from "node:assert/strict";
import test from "node:test";

import {
  concealUndiscoveredNpcName,
  containsNpcIntroduction,
  revealNpcAtIntroduction,
} from "../app/npc-visibility.ts";

test("keeps an NPC name private before it is spoken", () => {
  const scene =
    "Near the sandbox, a boy your age carefully arranges gray stones in a circle.";
  assert.equal(containsNpcIntroduction(scene, "Leo Park"), false);
  assert.equal(
    concealUndiscoveredNpcName(
      "Approach Leo and ask what he is building with Leo Park's stones.",
      "Leo Park",
    ),
    "Approach the other child and ask what he is building with the other child’s stones.",
  );
});

test("recognizes a spoken introduction", () => {
  const scene = 'The boy looks up. “I’m Leo,” he says, shifting over to make room.';
  assert.equal(containsNpcIntroduction(scene, "Leo Park"), true);
});

test("does not excuse an earlier omniscient name leak", () => {
  const scene = 'Leo sets down a stone. A moment later, he says, “My name is Leo.”';
  assert.equal(containsNpcIntroduction(scene, "Leo Park"), false);
});

test("conceals an early leak but preserves the spoken introduction", () => {
  assert.deepEqual(
    revealNpcAtIntroduction(
      'Leo sets down a stone. A moment later, he says, “My name is Leo.”',
      "Leo Park",
    ),
    {
      text: 'the other child sets down a stone. A moment later, he says, “My name is Leo.”',
      introduced: true,
    },
  );
});
