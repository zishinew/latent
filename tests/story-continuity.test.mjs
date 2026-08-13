import assert from "node:assert/strict";
import test from "node:test";

import { repeatsRecentBeat } from "../app/story-continuity.ts";

test("rejects a replayed line and action", () => {
  const prior =
    'The boy presses his palms flat. “What if I try and nothing happens?” The paper trembles between you.';
  const replay =
    'The boy presses his palms flat. “What if I try and nothing happens?” The paper trembles between you.';
  assert.equal(repeatsRecentBeat(replay, [prior]), true);
});

test("allows a scene to advance with the same characters and props", () => {
  const prior =
    'The boy presses his palms flat. “What if I try and nothing happens?” The paper trembles between you.';
  const next =
    'He finally exhales and nudges the paper toward you. “Okay. You make the wind, and I’ll try to hold one corner still.”';
  assert.equal(repeatsRecentBeat(next, [prior]), false);
});
