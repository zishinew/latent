import type { NpcProfile } from "../../characters";
import { phoneCharacterPrompt } from "../../game-prompts";

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

function localMessage(
  npc: NpcProfile,
  level: number,
  protagonistAge: number,
  replyTo: string,
): MessageResult {
  const canCrush = crushIsAgeAppropriate(
    protagonistAge,
    npc.age,
    level,
    npc.crushStyle,
  );
  if (replyTo) {
    if (level < 0 || npc.archetype === "rival") {
      return { text: "Big talk. Prove it when I see you.", intent: "challenge" };
    }
    if (npc.archetype === "tsundere") {
      return {
        text: "Fine. I can make time. Not because I was waiting or anything.",
        intent: canCrush ? "crush" : "casual",
      };
    }
    if (npc.archetype === "dandere") {
      return { text: "okay :) i'm glad you messaged first", intent: canCrush ? "crush" : "casual" };
    }
    return { text: "Okay! Tell me when you're free.", intent: "casual" };
  }

  if (level < -15 || npc.archetype === "rival") {
    return {
      text: "Park. After school. I want a rematch—and don't be late.",
      intent: "challenge",
    };
  }
  if (level < 25) {
    return {
      text: `Hey. Can you help me with ${npc.privateGoal.toLocaleLowerCase()}? I might owe you one.`,
      intent: "favor",
    };
  }
  if (canCrush) {
    if (npc.crushStyle === "shy") {
      return {
        text: "are you busy later? it's okay if you are. i just thought maybe we could hang out. just us.",
        intent: "crush",
      };
    }
    if (npc.crushStyle === "teasing" || npc.crushStyle === "guarded") {
      return {
        text: "You'd better come hang out later. It would be boring without someone worth teasing.",
        intent: "crush",
      };
    }
    return {
      text: `I saved you one of my ${npc.likes[1] ?? "favorite snacks"}. Want to meet after school?`,
      intent: "crush",
    };
  }
  if (npc.archetype === "tsundere") {
    return { text: "Training after school? Don't make me practice alone.", intent: "hangout" };
  }
  return { text: `Want to hang out and do something with ${npc.likes[0] ?? "our Gifts"}?`, intent: "hangout" };
}

async function generateMessage(context: Record<string, unknown>) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-5.6-luna",
      store: false,
      reasoning: { effort: "low" },
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
  const result =
    (await generateMessage({
      npc,
      protagonistAge,
      relationshipLevel: level,
      romanceAllowed: canCrush,
      memories,
      replyTo: replyTo || null,
      recentMessages,
    }).catch(() => null)) ?? localMessage(npc, level, protagonistAge, replyTo);

  return Response.json(
    result.intent === "crush" && !canCrush
      ? {
          ...localMessage(npc, Math.min(level, 24), protagonistAge, replyTo),
          intent: "casual",
        }
      : result,
  );
}
