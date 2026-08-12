import { env } from "cloudflare:workers";

type WorkerBindings = { DASHSCOPE_API_KEY?: unknown };

export async function getQwenApiKey(): Promise<string | undefined> {
  const apiKey = (env as WorkerBindings).DASHSCOPE_API_KEY;
  if (apiKey == null) return undefined;
  const value = String(apiKey).trim();
  return value || undefined;
}
