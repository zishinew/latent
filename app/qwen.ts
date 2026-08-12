type WorkerBindings = { DASHSCOPE_API_KEY?: unknown };

export async function getQwenApiKey(): Promise<string | undefined> {
  // Node is used only by the local rendered-HTML tests. The hosted Worker gets
  // its secret through Cloudflare's native binding module.
  if (typeof process !== "undefined" && process.versions?.node) {
    return process.env.DASHSCOPE_API_KEY;
  }

  const { env } = await import("cloudflare:workers");
  const apiKey = (env as WorkerBindings).DASHSCOPE_API_KEY;
  return typeof apiKey === "string" ? apiKey : undefined;
}
