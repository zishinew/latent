import { env } from "cloudflare:workers";

type WorkerBindings = { DASHSCOPE_API_KEY?: unknown };

export async function getQwenApiKey(): Promise<string | undefined> {
  const apiKey = (env as WorkerBindings).DASHSCOPE_API_KEY;
  return typeof apiKey === "string" ? apiKey : undefined;
}
