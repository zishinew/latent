import type { NpcProfile } from "../../characters";
import { phoneCharacterPrompt } from "../../game-prompts";
import { generateQwenJson, getQwenApiKey } from "../../qwen";

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

async function generateMessage(
  context: Record<string, unknown>,
  signal?: AbortSignal,
) {
  const intents: MessageIntent[] = [
    "hangout",
    "favor",
    "challenge",
    "casual",
    "crush",
  ];
  const allowedIntents =
    context.romanceAllowed === true
      ? intents
      : intents.filter((intent) => intent !== "crush");
  return generateQwenJson<MessageResult>({
    label: "phone message",
    system: phoneCharacterPrompt,
    context,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        text: { type: "string" },
        intent: { type: "string", enum: allowedIntents },
      },
      required: ["text", "intent"],
    },
    signal,
    parse: (value) => {
      if (
        typeof value.text !== "string" ||
        !value.text.trim() ||
        typeof value.intent !== "string" ||
        !allowedIntents.includes(value.intent as MessageIntent)
      ) {
        return null;
      }
      return {
        text: value.text.trim().slice(0, 500),
        intent: value.intent as MessageIntent,
      };
    },
  });
}

export async function POST(request: Request) {
  if (!getQwenApiKey()) {
    return Response.json(
      { error: "AI is not configured. Add an API key before sending messages." },
      { status: 503 },
    );
  }

  let body: Record<string, unknown>;
  try {
    const parsed = (await request.json()) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    body = parsed as Record<string, unknown>;
  } catch {
    return Response.json({ error: "A valid message request is required." }, { status: 400 });
  }
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
  const result = await generateMessage(
    {
      npc,
      protagonistAge,
      relationshipLevel: level,
      romanceAllowed: canCrush,
      memories,
      replyTo: replyTo || null,
      recentMessages,
    },
    request.signal,
  ).catch(() => null);

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
