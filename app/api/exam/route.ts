import { examPrompt } from "../../game-prompts";
import {
  acceptanceChance,
  examAttributeNames,
  type ExamAttributeName,
  type ExamSchoolDifficulty,
} from "../../exam-odds";
import { generateQwenJson, getQwenApiKey } from "../../qwen";

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function randomInt(max: number) {
  const range = 0x1_0000_0000;
  const ceiling = range - (range % max);
  const values = new Uint32Array(1);

  do {
    crypto.getRandomValues(values);
  } while (values[0] >= ceiling);

  return (values[0] % max) + 1;
}

function fallbackNarration(schoolName: string, accepted: boolean) {
  return accepted
    ? `The final trial ends with your pulse loud in your ears. When the results board lights up, your name is on the acceptance list—${schoolName} has chosen you. A proctor nods once in your direction, and somewhere behind you another candidate starts to cry. It is real: you are going to be a hero student.`
    : `The final trial ends with your pulse loud in your ears. When the results board lights up, your name is not on the list for ${schoolName}. The proctor thanks you for attending, and you walk out into the afternoon with every road still open. It stings—but the story is not over.`;
}

export async function POST(request: Request) {
  if (!getQwenApiKey()) {
    return Response.json(
      { error: "AI is not configured. Add an API key before taking the exam." },
      { status: 503 },
    );
  }

  let body: Record<string, unknown>;
  try {
    const parsed = (await request.json()) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    body = parsed as Record<string, unknown>;
  } catch {
    return Response.json({ error: "A valid exam request is required." }, { status: 400 });
  }

  const schoolName =
    typeof body.schoolName === "string" ? body.schoolName.trim().slice(0, 80) : "";
  const difficulty: ExamSchoolDifficulty | null =
    body.schoolDifficulty === "easy" ||
    body.schoolDifficulty === "medium" ||
    body.schoolDifficulty === "hard"
      ? body.schoolDifficulty
      : null;
  if (!schoolName || !difficulty) {
    return Response.json({ error: "A school to apply to is required." }, { status: 400 });
  }

  const incomingAttributes =
    body.attributes && typeof body.attributes === "object"
      ? (body.attributes as Record<string, unknown>)
      : {};
  const attributes = Object.fromEntries(
    examAttributeNames.map((attribute) => [
      attribute,
      typeof incomingAttributes[attribute] === "number"
        ? clamp(incomingAttributes[attribute], 0, 100)
        : 0,
    ]),
  ) as Record<ExamAttributeName, number>;
  const giftMastery =
    typeof body.giftMastery === "number" ? clamp(body.giftMastery, 0, 100) : 0;

  const chance = acceptanceChance(attributes, giftMastery, difficulty);
  const roll = randomInt(100);
  const accepted = roll <= chance;

  const context = {
    player: {
      name:
        typeof body.playerName === "string" ? body.playerName.slice(0, 100) : "the player",
      gender: typeof body.gender === "string" ? body.gender.slice(0, 30) : "unspecified",
      age: typeof body.age === "number" ? clamp(body.age, 8, 100) : 16,
      gift: typeof body.gift === "string" ? body.gift.slice(0, 80) : "Unknown",
      giftRules:
        typeof body.giftDescription === "string"
          ? body.giftDescription.slice(0, 300)
          : "No additional mechanics supplied.",
      attributes,
      giftMastery,
    },
    school: { name: schoolName, difficulty },
    result: { accepted, roll, chance },
  };

  const generated = await generateQwenJson<{ narration: string }>({
    label: "exam outcome",
    system: examPrompt,
    context,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: { narration: { type: "string" } },
      required: ["narration"],
    },
    signal: request.signal,
    parse: (value) =>
      typeof value.narration === "string" && value.narration.trim()
        ? { narration: value.narration.trim().slice(0, 1200) }
        : null,
  }).catch(() => null);

  return Response.json({
    accepted,
    chance,
    roll,
    narration: generated?.narration ?? fallbackNarration(schoolName, accepted),
    school: { name: schoolName, difficulty },
  });
}
