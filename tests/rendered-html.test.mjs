import assert from "node:assert/strict";
import test from "node:test";

process.env.DASHSCOPE_API_KEY = "";

const workerUrl = new URL("../dist/server/index.js", import.meta.url);
workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
const workerPromise = import(workerUrl.href).then(({ default: worker }) => worker);

const workerEnvironment = {
  ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
  DASHSCOPE_API_KEY: "",
};
const executionContext = { waitUntil() {}, passThroughOnException() {} };

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
  giftDescription: "Absorb existing flame. Cannot create fire.",
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
};

test("server-renders the latent landing screen", async () => {
  const response = await fetchWorker("/", { headers: { accept: "text/html" } });
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<title>latent\.<\/title>/i);
  assert.match(html, /<main class="landing-screen">/i);
});

test("deterministic practice remains available without AI", async () => {
  const response = await postJson("/api/judge", {
    ...baseAction,
    intent: "Practice controlling my Gift.",
  });
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.mode, "check");
  assert.equal(result.attribute, "Gift Mastery");
  assert.equal(result.checkSource, "routine");
});

test("AI-authored requests return errors instead of fallback content", async () => {
  const requests = [
    postJson("/api/judge", { ...baseAction, intent: "Thank Mara." }),
    postJson("/api/event", { trigger: "social", triggerContext: "school yard" }),
    postJson("/api/message", {}),
  ];

  for (const request of requests) {
    const response = await request;
    const result = await response.json();
    assert.equal(response.status, 503);
    assert.match(result.error, /AI is not configured/i);
  }
});
