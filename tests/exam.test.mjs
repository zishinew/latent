import assert from "node:assert/strict";
import test from "node:test";

import {
  acceptanceChance,
} from "../app/exam-odds.ts";

const freshAttributes = {
  Strength: 3,
  Agility: 3,
  Willpower: 4,
  Intelligence: 3,
  Vigor: 4,
  Rapport: 3,
};
const trainedAttributes = {
  Strength: 14,
  Agility: 12,
  Willpower: 16,
  Intelligence: 13,
  Vigor: 14,
  Rapport: 10,
};

test("easier schools always offer better odds than harder ones", () => {
  const giftMastery = 10;
  assert.ok(
    acceptanceChance(freshAttributes, giftMastery, "easy") >
      acceptanceChance(freshAttributes, giftMastery, "medium"),
  );
  assert.ok(
    acceptanceChance(freshAttributes, giftMastery, "medium") >
      acceptanceChance(freshAttributes, giftMastery, "hard"),
  );
});

test("raising attributes and gift mastery improves odds at every school", () => {
  const difficulties = ["easy", "medium", "hard"];
  for (const difficulty of difficulties) {
    const base = acceptanceChance(freshAttributes, 2, difficulty);
    const higher = acceptanceChance(trainedAttributes, 40, difficulty);
    assert.ok(
      higher >= base,
      `${difficulty} should be easier with better stats (${base} -> ${higher})`,
    );
  }
});

test("chance is capped within sane bounds", () => {
  const max = {
    Strength: 100,
    Agility: 100,
    Willpower: 100,
    Intelligence: 100,
    Vigor: 100,
    Rapport: 100,
  };
  const difficulties = ["easy", "medium", "hard"];
  for (const difficulty of difficulties) {
    const chance = acceptanceChance(max, 100, difficulty);
    assert.ok(chance >= 0 && chance <= 100);
    assert.ok(chance >= 75, `${difficulty} should be near-certain for a maxed student`);
  }
});