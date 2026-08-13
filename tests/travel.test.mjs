import assert from "node:assert/strict";
import test from "node:test";

import {
  isAtLocation,
  travelDestination,
  travelNarration,
} from "../app/travel.ts";

test("detects ordinary travel to a known place", () => {
  assert.equal(travelDestination("I walk home and read the textbook")?.key, "home");
  assert.equal(travelDestination("I go to the park")?.key, "park");
  assert.equal(travelDestination("I head to the library")?.key, "library");
  assert.equal(travelDestination("I walk to school")?.key, "school");
  assert.equal(travelDestination("I return home")?.key, "home");
});

test("does not treat non-travel actions as travel", () => {
  assert.equal(travelDestination("I read the textbook section"), null);
  assert.equal(travelDestination("I practice my Gift"), null);
  assert.equal(travelDestination("I apologize for being late"), null);
  assert.equal(travelDestination("I eat lunch"), null);
});

test("ignores negated travel statements", () => {
  assert.equal(travelDestination("I won't go home"), null);
  assert.equal(travelDestination("I don't want to walk to the park"), null);
});

test("location matching reflects whether the player is already there", () => {
  const home = { key: "home", label: "home" };
  const park = { key: "park", label: "the park" };
  assert.equal(isAtLocation(home, "your room"), true);
  assert.equal(isAtLocation(home, "City Park"), false);
  assert.equal(isAtLocation(park, "the city park"), true);
  assert.equal(isAtLocation(park, null), false);
});

test("travel narration is in second person and mentions the destination", () => {
  const home = { key: "home", label: "home" };
  assert.ok(travelNarration(home, false).includes("home"));
  assert.ok(travelNarration(home, false).startsWith("You"));
  assert.ok(travelNarration(home, true).includes("already"));
});