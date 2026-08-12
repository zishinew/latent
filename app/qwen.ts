export function getQwenApiKey(): string | undefined {
  // Local Next.js reads `.env` automatically. Keep the older variable name as
  // a compatibility alias while Qwen projects move to DASHSCOPE_API_KEY.
  const value = (process.env.DASHSCOPE_API_KEY ?? process.env.OPENAI_API_KEY ?? "").trim();
  return value || undefined;
}
