import assert from "node:assert/strict";
import test from "node:test";

// Regression tests exercise the deterministic local referee. Live model behavior
// is covered by the same server-side normalization before it reaches the client.
process.env.OPENAI_API_KEY = "";

const workerUrl = new URL("../dist/server/index.js", import.meta.url);
workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
const workerPromise = import(workerUrl.href).then(({ default: worker }) => worker);

const workerEnvironment = {
  ASSETS: {
    fetch: async () => new Response("Not found", { status: 404 }),
  },
};

const executionContext = {
  waitUntil() {},
  passThroughOnException() {},
};

async function fetchWorker(path, init) {
  const worker = await workerPromise;
  return worker.fetch(
    new Request(`http://localhost${path}`, init),
    workerEnvironment,
    executionContext,
  );
}

async function postJson(path, body) {
  return fetchWorker(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const baseAction = {
  playerName: "Ari Vale",
  gender: "nonbinary",
  age: 8,
  gift: "Flame Absorption",
  giftDescription:
    "Absorb existing flame and release it through infused attacks. Cannot create fire.",
  attributes: {
    Strength: 4,
    Agility: 4,
    Willpower: 4,
    Intelligence: 4,
    Vigor: 2,
    Rapport: 2,
  },
  giftMastery: 0,
  fateScore: 0,
  recentContext: [],
};

test("server-renders the latent landing screen", async () => {
  const response = await fetchWorker("/", {
    headers: { accept: "text/html" },
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>latent\.<\/title>/i);
  assert.match(html, /<main class="landing-screen">/i);
  assert.match(html, /there is a gift/i);
  assert.match(html, /<button class="game-button" type="button">start<\/button>/i);
  assert.doesNotMatch(html, /codex-preview|SkeletonPreview|Building your site/i);
});

test("routine actions resolve directly without a wheel", async () => {
  const cases = [
    "Thank Mara and continue observing quietly.",
    "Ask what the warning means.",
    "Hand the ball back.",
  ];

  for (const intent of cases) {
    const response = await postJson("/api/judge", {
      ...baseAction,
      intent,
      eventContext: "Mara waits beside you in the hero center.",
    });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.mode, "automatic", intent);
    assert.equal(result.outcome, null, intent);
    assert.equal(result.roll, null, intent);
    assert.equal(result.distribution, null, intent);
  }
});

test("leaving an ordinary scene ends it immediately", async () => {
  const response = await postJson("/api/judge", {
    ...baseAction,
    intent: "Say goodbye and leave the playground.",
    eventContext: "Mara has finished explaining the chalk game.",
  });
  const result = await response.json();
  assert.equal(result.mode, "automatic");
  assert.equal(result.sceneDisposition, "end");
  assert.equal(result.timeCost, "moment");
});

test("uncertain training uses one truthful five-tier d100 check", async () => {
  const response = await postJson("/api/judge", {
    ...baseAction,
    intent: "Train my Gift carefully.",
  });
  assert.equal(response.status, 200);
  const result = await response.json();
  const tiers = [
    "major_setback",
    "setback",
    "mixed",
    "success",
    "breakthrough",
  ];

  assert.equal(result.mode, "check");
  assert.ok(tiers.includes(result.outcome));
  assert.ok(Number.isInteger(result.roll));
  assert.ok(result.roll >= 1 && result.roll <= 100);
  assert.equal(
    Object.values(result.distribution).reduce((total, value) => total + value, 0),
    100,
  );
  assert.ok(
    Object.values(result.distribution).every(
      (value) => Number.isInteger(value) && value >= 0,
    ),
  );

  let cumulative = 0;
  const landedTier = tiers.find((tier) => {
    cumulative += result.distribution[tier];
    return result.roll <= cumulative;
  });
  assert.equal(result.outcome, landedTier);
  assert.equal(
    result.cleanChance,
    result.distribution.success + result.distribution.breakthrough,
  );
});

test("higher relevant skill improves a non-training performance check", async () => {
  const lowResponse = await postJson("/api/judge", {
    ...baseAction,
    intent: "Try to catch the heavy falling crate.",
    attributes: { ...baseAction.attributes, Strength: 0 },
  });
  const highResponse = await postJson("/api/judge", {
    ...baseAction,
    intent: "Try to catch the heavy falling crate.",
    attributes: { ...baseAction.attributes, Strength: 80 },
  });
  const low = await lowResponse.json();
  const high = await highResponse.json();

  assert.equal(low.mode, "check");
  assert.equal(high.mode, "check");
  assert.ok(high.cleanChance > low.cleanChance);
});

test("Gift practice always trains Gift Mastery with tiered growth", async () => {
  const expectedGain = {
    major_setback: 0,
    setback: 0,
    mixed: 0.19,
    success: 0.35,
    breakthrough: 0.63,
  };
  const observed = new Set();

  for (let attempt = 0; attempt < 30; attempt += 1) {
    const response = await postJson("/api/judge", {
      ...baseAction,
      intent: "I carefully practice controlling my Gift.",
    });
    const result = await response.json();
    observed.add(result.outcome);

    assert.equal(result.mode, "check");
    assert.equal(result.attribute, "Gift Mastery");
    assert.equal(result.checkSource, "routine");
    assert.equal(result.timeCost, "session");
    assert.equal(result.gain, expectedGain[result.outcome]);
    assert.equal(
      result.growth.find((entry) => entry.stat === "Gift Mastery")?.amount ?? 0,
      expectedGain[result.outcome],
    );
  }

  assert.ok(
    [...observed].some((outcome) =>
      ["mixed", "success", "breakthrough"].includes(outcome),
    ),
    "the sample should include at least one growth-granting outcome",
  );
});

test("routine training rewards Intelligence and becomes harder near mastery", async () => {
  const shared = {
    ...baseAction,
    intent: "I spend the afternoon training my body.",
  };
  const noviceLowIntelligence = await (
    await postJson("/api/judge", {
      ...shared,
      attributes: {
        ...baseAction.attributes,
        Strength: 5,
        Intelligence: 0,
      },
    })
  ).json();
  const noviceHighIntelligence = await (
    await postJson("/api/judge", {
      ...shared,
      attributes: {
        ...baseAction.attributes,
        Strength: 5,
        Intelligence: 80,
      },
    })
  ).json();
  const expertHighIntelligence = await (
    await postJson("/api/judge", {
      ...shared,
      attributes: {
        ...baseAction.attributes,
        Strength: 85,
        Intelligence: 80,
      },
    })
  ).json();

  assert.equal(noviceLowIntelligence.checkSource, "routine");
  assert.ok(
    noviceHighIntelligence.cleanChance > noviceLowIntelligence.cleanChance,
    "higher Intelligence should improve training quality",
  );
  assert.ok(
    expertHighIntelligence.cleanChance < noviceHighIntelligence.cleanChance,
    "a highly developed target stat should be harder to improve",
  );
});

test("positive event checks grant stronger multi-stat real-world growth", async () => {
  let positiveResult;

  for (let attempt = 0; attempt < 30 && !positiveResult; attempt += 1) {
    const response = await postJson("/api/judge", {
      ...baseAction,
      intent: "Try to catch the falling practice barrier before it hits anyone.",
      eventContext:
        "A damaged practice barrier tips toward two children during a hero-center drill.",
      eventMeta: { beatType: "danger", intensity: "high" },
    });
    const result = await response.json();
    if (["mixed", "success", "breakthrough"].includes(result.outcome)) {
      positiveResult = result;
    }
  }

  assert.ok(positiveResult, "the sample should include a positive event outcome");
  assert.equal(positiveResult.checkSource, "event");
  assert.ok(positiveResult.gain > 0.63, "event growth should exceed routine practice");
  assert.ok(
    positiveResult.growth.length > 1,
    "real-world experience should develop supporting attributes too",
  );
});

test("unsupported power declarations are blocked without rolling or rewards", async () => {
  const response = await postJson("/api/judge", {
    ...baseAction,
    intent: "I become the strongest hero alive.",
  });
  const result = await response.json();

  assert.equal(result.mode, "blocked");
  assert.equal(result.roll, null);
  assert.equal(result.distribution, null);
  assert.equal(result.gain, 0);
  assert.equal(result.fateDelta, 0);
  assert.equal(result.relationshipDelta, 0);
});

test("binding Gift limitations cannot be bypassed through player narration", async () => {
  const response = await postJson("/api/judge", {
    ...baseAction,
    intent: "Create fire from nothing and throw it.",
  });
  const result = await response.json();

  assert.equal(result.mode, "blocked");
  assert.equal(result.roll, null);
  assert.match(result.narration, /cannot create fire|absorb an existing flame/i);
});

test("exploration opens a scene instead of pretending it already happened", async () => {
  const response = await postJson("/api/judge", {
    ...baseAction,
    intent: "Explore the neighborhood.",
  });
  const result = await response.json();

  assert.equal(result.mode, "scene");
  assert.equal(result.outcome, null);
  assert.equal(result.sceneRequest.trigger, "exploration");
});

test("scene hard caps release the player instead of hanging", async () => {
  const response = await postJson("/api/event", {
    trigger: "continuation",
    triggerContext: "school playground",
    story: { turn: 3, eventCount: 1, recentBeats: [], threads: [] },
    activeScene: {
      kind: "social",
      location: "school playground",
      npc: null,
      lastEvent: "The chalk game has reached a natural pause.",
      summary: "The children finished testing the chalk game.",
      beatType: "relationship",
      intensity: "low",
      targetTurns: 2,
      turns: 1,
    },
  });
  const result = await response.json();

  assert.equal(result.sceneStatus, "end");
  assert.deepEqual(result.choices, []);
  assert.match(result.text, /free to continue your day|reached its natural end/i);
});

test("new NPCs introduce themselves before their name is narrated", async () => {
  const response = await postJson("/api/event", {
    trigger: "social",
    triggerContext: "school playground",
    story: { turn: 1, eventCount: 1, recentBeats: [], threads: [] },
    knownCharacters: [],
  });
  const result = await response.json();
  const givenName = result.npc.name.split(/\s+/)[0];

  assert.match(result.text, new RegExp(`(?:I'm|I’m|I am) ${givenName}\\b`, "i"));
  assert.doesNotMatch(result.text, new RegExp(result.npc.name, "i"));
  assert.equal(result.sceneStatus, "continue");
  assert.equal(result.choices.length, 3);
});
