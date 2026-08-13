const defaultBaseUrl =
  "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";
const defaultModel = "qwen3.7-flash";

type JsonObject = Record<string, unknown>;

type QwenJsonRequest<T> = {
  label: string;
  system: string;
  context: JsonObject;
  schema: JsonObject;
  model?: string;
  signal?: AbortSignal;
  attempts?: number;
  parse?: (value: JsonObject) => T | null;
};

export function getQwenApiKey(): string | undefined {
  // Keep OPENAI_API_KEY as a migration alias for existing deployments that
  // stored their DashScope key under the old provider-neutral binding.
  const value = (
    process.env.DASHSCOPE_API_KEY ??
    process.env.OPENAI_API_KEY ??
    ""
  ).trim();
  return value || undefined;
}

function qwenBaseUrl() {
  return (process.env.DASHSCOPE_BASE_URL ?? defaultBaseUrl)
    .trim()
    .replace(/\/$/, "");
}

function qwenModel() {
  return (process.env.QWEN_MODEL ?? defaultModel).trim() || defaultModel;
}

function record(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function responseText(payload: unknown): string | null {
  const root = record(payload);
  if (!root) return null;

  const choices = Array.isArray(root.choices) ? root.choices : [];
  for (const choice of choices) {
    const message = record(record(choice)?.message);
    const content = message?.content;
    if (typeof content === "string" && content.trim()) return content;
    if (Array.isArray(content)) {
      const text = content
        .map((part) => record(part)?.text)
        .filter((part): part is string => typeof part === "string")
        .join("");
      if (text.trim()) return text;
    }
  }

  if (typeof root.output_text === "string" && root.output_text.trim()) {
    return root.output_text;
  }

  const output = Array.isArray(root.output) ? root.output : [];
  const text = output
    .flatMap((item) => {
      const content = record(item)?.content;
      return Array.isArray(content) ? content : [];
    })
    .map((part) => record(part)?.text)
    .filter((part): part is string => typeof part === "string")
    .join("");
  return text.trim() ? text : null;
}

function parseJsonObject(text: string): JsonObject | null {
  let candidate: unknown = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");

  // Some Qwen-compatible gateways double-encode JSON as a JSON string.
  for (let depth = 0; depth < 3; depth += 1) {
    if (typeof candidate !== "string") break;
    const candidateText = candidate;
    try {
      candidate = JSON.parse(candidateText);
    } catch {
      const start = candidateText.indexOf("{");
      const end = candidateText.lastIndexOf("}");
      if (start < 0 || end <= start) return null;
      try {
        candidate = JSON.parse(candidateText.slice(start, end + 1));
      } catch {
        return null;
      }
    }
  }

  return record(candidate);
}

function retryableStatus(status: number) {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

function logFailure(
  label: string,
  detail: { attempt: number; status?: number; requestId?: string | null; reason: string },
) {
  console.error(`[latent] Qwen ${label} failed ${JSON.stringify(detail)}`);
}

/**
 * Request one JSON object from Qwen.
 *
 * DashScope's Responses endpoint ignores OpenAI's `text.format` parameter.
 * The documented structured-output path is Chat Completions JSON mode, so the
 * schema is included in the prompt and the returned object is validated by the
 * caller. The parser still accepts Responses-shaped payloads during rolling
 * deploys and double-encoded JSON returned by some compatible gateways.
 */
export async function generateQwenJson<T>({
  label,
  system,
  context,
  schema,
  model,
  signal,
  attempts = 2,
  parse,
}: QwenJsonRequest<T>): Promise<T | null> {
  const apiKey = getQwenApiKey();
  if (!apiKey) return null;

  const contract = `${system}\n\nReturn exactly one JSON object matching this JSON Schema. Do not wrap it in markdown or encode it as a string.\n${JSON.stringify(schema)}`;
  const endpoint = `${qwenBaseUrl()}/chat/completions`;

  for (let attempt = 1; attempt <= Math.max(1, attempts); attempt += 1) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        signal,
        body: JSON.stringify({
          model: model?.trim() || qwenModel(),
          messages: [
            { role: "system", content: contract },
            { role: "user", content: JSON.stringify(context) },
          ],
          response_format: { type: "json_object" },
          enable_thinking: false,
          temperature: 0.35,
        }),
      });

      if (!response.ok) {
        logFailure(label, {
          attempt,
          status: response.status,
          requestId:
            response.headers.get("x-request-id") ??
            response.headers.get("x-dashscope-request-id"),
          reason: response.statusText || "request rejected",
        });
        if (!retryableStatus(response.status)) return null;
        continue;
      }

      const payload = (await response.json()) as unknown;
      const text = responseText(payload);
      const parsed = text ? parseJsonObject(text) : null;
      const normalized = parsed ? (parse ? parse(parsed) : (parsed as T)) : null;
      if (normalized) return normalized;

      logFailure(label, {
        attempt,
        requestId:
          response.headers.get("x-request-id") ??
          response.headers.get("x-dashscope-request-id"),
        reason: text
          ? parsed
            ? "JSON did not match the required contract"
            : "invalid JSON object"
          : "missing response text",
      });
    } catch (error) {
      if (signal?.aborted) return null;
      logFailure(label, {
        attempt,
        reason: error instanceof Error ? error.message.slice(0, 160) : "network error",
      });
    }
  }

  return null;
}
