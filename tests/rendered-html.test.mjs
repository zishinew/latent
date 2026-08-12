import assert from "node:assert/strict";
import test from "node:test";

const workerUrl = new URL("../dist/server/index.js", import.meta.url);
workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
const workerPromise = import(workerUrl.href).then(({ default: worker }) => worker);

const workerEnvironment = {
  ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
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

test("server-renders the latent landing screen", async () => {
  const response = await fetchWorker("/", { headers: { accept: "text/html" } });
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<title>latent\.<\/title>/i);
  assert.match(html, /<main class="landing-screen">/i);
});
