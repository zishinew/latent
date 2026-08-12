import type { NpcProfile } from "../../characters";
import { phoneCharacterPrompt } from "../../game-prompts";
import { getQwenApiKey } from "../../qwen";

type MessageIntent = "hangout" | "favor" | "challenge" | "casual" | "crush";
type MessageResult = { text: string; intent: MessageIntent };

function crushIsAgeAppropriate(
  protagonistAge: number,
  npcAge: number,
  level: number,
  crushStyle: NpcProfile["crushStyle"],
) {
  const threshold =
    crushStyle === "open"
      ? 50
      : crushStyle === "shy" || crushStyle === "teasing"
        ? 60
        : crushStyle === "guarded"
          ? 70
          : 85;
  if (level < threshold) return false;
  const bothChildren = protagonistAge < 18 && npcAge < 18;
  const bothAdults = protagonistAge >= 18 && npcAge >= 18;
  return (bothChildren && Math.abs(protagonistAge - npcAge) <= 2) || bothAdults;
}

async function generateMessage(context: Record<string, unknown>) {
  const apiKey = await getQwenApiKey();
  if (!apiKey) return null;

  const response = await fetch("https://dashscope-intl.aliyuncs.com/compatible-mode/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "qwen3.7-plus",
      store: false,
      enable_thinking: false,
      input: [
        {
          role: "system",
          content: phoneCharacterPrompt,
        },
        { role: "user", content: JSON.stringify(context) },
      ],
      text: {
        verbosity: "low",
        format: {
          type: "json_schema",
          name: "npc_message",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              text: { type: "string" },
              intent: {
                type: "string",
                enum: ["hangout", "favor", "challenge", "casual", "crush"],
              },
            },
            required: ["text", "intent"],
          },
        },
      },
    }),
  });
  if (!response.ok) return null;
  const payload = (await response.json()) as {
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  };
  const outputText = payload.output
    ?.flatMap((item) => item.content ?? [])
    .find((item) => item.type === "output_text")?.text;
  return outputText ? (JSON.parse(outputText) as MessageResult) : null;
}

export async function POST(request: Request) {
  if (!(await getQwenApiKey())) {
    return Response.json(
      { error: "AI is not configured. Add an API key before sending messages." },
      { status: 503 },
    );
  }

  const body = (await request.json()) as Record<string, unknown>;
  const npc = body.npc as NpcProfile | undefined;
  if (!npc || typeof npc.name !== "string") {
    return Response.json({ error: "A character profile is required." }, { status: 400 });
  }
  const protagonistAge =
    typeof body.protagonistAge === "number"
      ? Math.max(8, Math.min(body.protagonistAge, 100))
      : 8;
  const level =
    typeof body.level === "number"
      ? Math.max(-100, Math.min(body.level, 100))
      : 0;
  const replyTo =
    typeof body.replyTo === "string" ? body.replyTo.slice(0, 300) : "";
  const memories = Array.isArray(body.memories) ? body.memories.slice(-10) : [];
  const recentMessages = Array.isArray(body.recentMessages)
    ? body.recentMessages.slice(-10)
    : [];
  const canCrush = crushIsAgeAppropriate(
    protagonistAge,
    npc.age,
    level,
    npc.crushStyle,
  );
  const result = await generateMessage({
    npc,
    protagonistAge,
    relationshipLevel: level,
    romanceAllowed: canCrush,
    memories,
    replyTo: replyTo || null,
    recentMessages,
  }).catch(() => null);

  if (!result) {
    return Response.json(
      { error: "AI is unavailable right now. Please try again." },
      { status: 502 },
    );
  }

  if (result.intent === "crush" && !canCrush) {
    return Response.json(
      { error: "AI returned an invalid message. Please try again." },
      { status: 502 },
    );
  }

  return Response.json(result);
}
