import { actionRefereePrompt } from "../../game-prompts";

const attributeNames = [
  "Strength",
  "Agility",
  "Willpower",
  "Intelligence",
  "Vigor",
  "Rapport",
] as const;

type AttributeName = (typeof attributeNames)[number];
type SkillName = AttributeName | "Gift Mastery";
const skillNames: SkillName[] = [...attributeNames, "Gift Mastery"];
type ResolutionMode = "automatic" | "check" | "blocked" | "scene";
type Difficulty = "easy" | "standard" | "hard" | "extreme";
type Category =
  | "physical"
  | "study"
  | "gift"
  | "social"
  | "exploration"
  | "conversation"
  | "movement"
  | "other";
type Circumstance =
  | "major_disadvantage"
  | "disadvantage"
  | "neutral"
  | "advantage"
  | "major_advantage";
type Risk = "safe" | "low" | "meaningful" | "high";
type TimeCost = "moment" | "short" | "session" | "day";
type SceneDisposition = "continue" | "end";
type MoralIntent = "heroic" | "neutral" | "selfish" | "cruel";
type MoralWeight = "none" | "minor" | "major";
type SocialImpact = "none" | "minor" | "meaningful";
type RelationshipReaction =
  | "very_negative"
  | "negative"
  | "neutral"
  | "positive"
  | "very_positive";
type OutcomeTier =
  | "major_setback"
  | "setback"
  | "mixed"
  | "success"
  | "breakthrough";
type OutcomeWeights = Record<OutcomeTier, number>;
type OutcomeDraft = {
  narration: string;
  reaction: RelationshipReaction;
  thought: string | null;
  memory: string | null;
  sceneDisposition: SceneDisposition;
};
type ActionPlan = {
  resolutionMode: ResolutionMode;
  difficulty: Difficulty;
  attribute: SkillName;
  category: Category;
  circumstance: Circumstance;
  risk: Risk;
  timeCost: TimeCost;
  moralIntent: MoralIntent;
  moralWeight: MoralWeight;
  growthEligible: boolean;
  socialImpact: SocialImpact;
  sceneTrigger: "none" | "exploration" | "social";
  sceneContext: string;
  automatic: OutcomeDraft;
  blocked: OutcomeDraft;
  outcomes: Record<OutcomeTier, OutcomeDraft>;
};

const outcomeTiers: OutcomeTier[] = [
  "major_setback",
  "setback",
  "mixed",
  "success",
  "breakthrough",
];

const baseCleanChance: Record<Difficulty, number> = {
  easy: 68,
  standard: 48,
  hard: 25,
  extreme: 8,
};

const circumstanceModifier: Record<Circumstance, number> = {
  major_disadvantage: -15,
  disadvantage: -8,
  neutral: 0,
  advantage: 8,
  major_advantage: 15,
};

const mixedChance: Record<Risk, number> = {
  safe: 24,
  low: 20,
  meaningful: 16,
  high: 12,
};

const majorSetbackShare: Record<Risk, number> = {
  safe: 0.05,
  low: 0.12,
  meaningful: 0.22,
  high: 0.32,
};

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

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] ?? name;
}

function npcName(npcContext: unknown) {
  if (!npcContext || typeof npcContext !== "object") return null;
  const name = (npcContext as Record<string, unknown>).name;
  return typeof name === "string" && name.trim() ? name.trim() : null;
}

function npcWasIntroduced(
  npcContext: unknown,
  eventContext: string | null,
  recentContext: unknown[],
) {
  const name = npcName(npcContext);
  if (!name) return true;
  const context = `${eventContext ?? ""} ${JSON.stringify(recentContext)}`.toLocaleLowerCase();
  return context.includes(firstName(name).toLocaleLowerCase());
}

function draft(
  narration: string,
  sceneDisposition: SceneDisposition = "continue",
  reaction: RelationshipReaction = "neutral",
): OutcomeDraft {
  return {
    narration,
    reaction,
    thought: null,
    memory: null,
    sceneDisposition,
  };
}

function blockedActionPlan(narration: string): ActionPlan {
  const neutral = draft(narration);
  return {
    resolutionMode: "blocked",
    difficulty: "extreme",
    attribute: "Willpower",
    category: "other",
    circumstance: "neutral",
    risk: "safe",
    timeCost: "moment",
    moralIntent: "neutral",
    moralWeight: "none",
    growthEligible: false,
    socialImpact: "none",
    sceneTrigger: "none",
    sceneContext: "",
    automatic: neutral,
    blocked: neutral,
    outcomes: Object.fromEntries(
      outcomeTiers.map((tier) => [tier, neutral]),
    ) as Record<OutcomeTier, OutcomeDraft>,
  };
}

function impossibleClaim(intent: string) {
  return /\b(?:become|am|turn into) (?:the )?(?:strongest|most powerful|invincible|a god)|\bmaster(?:y|ed)? (?:my |the )?(?:gift|power) instantly\b|\bunlimited power\b|\bi automatically (?:win|succeed|master)\b|\bi (?:win|defeat everyone) instantly\b|\bskip (?:ahead|years)\b/i.test(
    intent,
  );
}

function giftRuleViolation(intent: string, gift: string) {
  if (!/flame absorption/i.test(gift)) return null;
  const claimsFireCreation =
    /\b(?:create|conjure|summon|generate|produce)\b[^.!?]{0,28}\b(?:fire|flames?)\b/i.test(
      intent,
    );
  const usesStoredFire = /\b(?:absorbed|stored|existing|held)\b/i.test(intent);
  return claimsFireCreation && !usesStoredFire
    ? "Flame Absorption cannot create fire. You need to absorb an existing flame first; stored flame can then be released through fire-infused attacks."
    : null;
}

function obviousAutomatic(intent: string) {
  return /^(?:i\s+)?(?:thank\b|nod\b|listen\b|wait\b|watch\b|observe\b|look quietly\b|answer\b|reply\b|explain\b|apologize\b|wave\b|smile\b|introduce myself\b|say hello\b|say goodbye\b|ask (?:what|when|where|who|why|how|if|whether|their name|his name|her name)\b|call for (?:available )?help\b|hand (?:it|the\b)|give (?:it|the\b)|accept\b|decline\b)/i.test(
    intent.trim(),
  );
}

function obviousSceneRequest(intent: string, hasActiveScene: boolean) {
  if (hasActiveScene) return null;
  if (/\b(?:explore|look around|investigate|visit)\b/i.test(intent)) {
    return "exploration" as const;
  }
  if (/\b(?:meet people|make friends|find someone to talk to|look for friends)\b/i.test(intent)) {
    return "social" as const;
  }
  return null;
}

function isGiftPractice(intent: string) {
  const normalized = intent.toLocaleLowerCase();
  const practiceVerb = /\b(?:practice|train|training|exercise|develop|improve|work on|experiment with)\b/;
  const giftTerm = /\b(?:gift|power|ability)\b/;
  return practiceVerb.test(normalized) && giftTerm.test(normalized);
}

function closesScene(intent: string) {
  return /\b(?:goodbye|farewell|leave|walk away|head home|go home|end (?:the |this )?(?:conversation|interaction)|return to (?:watching|observing|my day))\b/i.test(
    intent,
  );
}

function localPlan(
  intent: string,
  eventContext: string | null,
  npcContext: unknown,
): ActionPlan {
  const normalized = intent.toLocaleLowerCase();
  const name = npcName(npcContext);
  const person = name ? firstName(name) : "the other person";
  const ending = closesScene(intent) ? "end" : "continue";
  const blockedText =
    "That outcome cannot be declared into existence. You can attempt one immediate step toward it, but progress still has to be earned.";
  const automaticText = name
    ? `${person} responds to what you do, and the moment moves forward without resistance.`
    : "You do it without difficulty, and the day moves naturally around the choice.";
  const sceneTrigger = obviousSceneRequest(intent, Boolean(eventContext));

  if (impossibleClaim(intent)) {
    return blockedActionPlan(blockedText);
  }

  if (sceneTrigger) {
    const neutral = draft("You set out, letting the next part of the day take shape.");
    return {
      resolutionMode: "scene",
      difficulty: "standard",
      attribute: "Willpower",
      category: sceneTrigger === "social" ? "social" : "exploration",
      circumstance: "neutral",
      risk: "safe",
      timeCost: "short",
      moralIntent: "neutral",
      moralWeight: "none",
      growthEligible: false,
      socialImpact: "none",
      sceneTrigger,
      sceneContext: intent.slice(0, 100),
      automatic: neutral,
      blocked: neutral,
      outcomes: Object.fromEntries(outcomeTiers.map((tier) => [tier, neutral])) as Record<OutcomeTier, OutcomeDraft>,
    };
  }

  const isGift = /\b(?:gift|power|flame|fire|ability|control)\b/.test(normalized);
  const isStudy = /\b(?:study|read|homework|learn|class)\b/.test(normalized);
  const isTraining = /\b(?:train|workout|push.?up|run|exercise|lift|spar|practice)\b/.test(normalized);
  const isRisky = /\b(?:attack|fight|dodge|escape|sneak|climb|convince|persuade|deceive|lie|steal|rescue|save|catch|break into)\b/.test(normalized);
  const requiresCheck = isGift || isStudy || isTraining || isRisky;
  const attribute: SkillName = isGift
    ? "Gift Mastery"
    : isStudy
      ? "Intelligence"
      : /\b(?:run|sprint|dodge|sneak|climb)\b/.test(normalized)
        ? "Agility"
        : /\b(?:convince|persuade|deceive)\b/.test(normalized)
          ? "Rapport"
          : "Strength";
  const category: Category = isGift
    ? "gift"
    : isStudy
      ? "study"
      : isTraining
        ? "physical"
        : isRisky
          ? "other"
          : "conversation";
  const outcomes: Record<OutcomeTier, OutcomeDraft> = {
    major_setback: draft("The attempt falls apart and creates a new, immediate problem."),
    setback: draft("The attempt does not work, though the failure makes the limit clearer."),
    mixed: draft("You make partial progress, but it comes with a complication you cannot ignore."),
    success: draft("The attempt works as intended, grounded in what you can currently do."),
    breakthrough: draft("The attempt works unusually well and reveals one useful next step."),
  };

  return {
    resolutionMode: requiresCheck && !obviousAutomatic(intent) ? "check" : "automatic",
    difficulty: "standard",
    attribute,
    category,
    circumstance: "neutral",
    risk: isRisky ? "meaningful" : "safe",
    timeCost: requiresCheck && (isTraining || isStudy || isGift) ? "session" : "moment",
    moralIntent: "neutral",
    moralWeight: "none",
    growthEligible: isTraining || isStudy || isGift,
    socialImpact: name ? "minor" : "none",
    sceneTrigger: "none",
    sceneContext: "",
    automatic: draft(automaticText, ending),
    blocked: draft(blockedText),
    outcomes,
  };
}

function outcomeDraftSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      narration: { type: "string" },
      reaction: {
        type: "string",
        enum: ["very_negative", "negative", "neutral", "positive", "very_positive"],
      },
      thought: { anyOf: [{ type: "string" }, { type: "null" }] },
      memory: { anyOf: [{ type: "string" }, { type: "null" }] },
      sceneDisposition: { type: "string", enum: ["continue", "end"] },
    },
    required: ["narration", "reaction", "thought", "memory", "sceneDisposition"],
  } as const;
}

async function generatePlan(context: Record<string, unknown>): Promise<ActionPlan | null> {
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
      reasoning: { effort: "medium" },
      input: [
        { role: "system", content: actionRefereePrompt },
        { role: "user", content: JSON.stringify(context) },
      ],
      text: {
        verbosity: "low",
        format: {
          type: "json_schema",
          name: "latent_action_plan",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              resolutionMode: {
                type: "string",
                enum: ["automatic", "check", "blocked", "scene"],
              },
              difficulty: {
                type: "string",
                enum: ["easy", "standard", "hard", "extreme"],
              },
              attribute: { type: "string", enum: skillNames },
              category: {
                type: "string",
                enum: [
                  "physical",
                  "study",
                  "gift",
                  "social",
                  "exploration",
                  "conversation",
                  "movement",
                  "other",
                ],
              },
              circumstance: {
                type: "string",
                enum: [
                  "major_disadvantage",
                  "disadvantage",
                  "neutral",
                  "advantage",
                  "major_advantage",
                ],
              },
              risk: {
                type: "string",
                enum: ["safe", "low", "meaningful", "high"],
              },
              timeCost: {
                type: "string",
                enum: ["moment", "short", "session", "day"],
              },
              moralIntent: {
                type: "string",
                enum: ["heroic", "neutral", "selfish", "cruel"],
              },
              moralWeight: {
                type: "string",
                enum: ["none", "minor", "major"],
              },
              growthEligible: { type: "boolean" },
              socialImpact: {
                type: "string",
                enum: ["none", "minor", "meaningful"],
              },
              sceneTrigger: {
                type: "string",
                enum: ["none", "exploration", "social"],
              },
              sceneContext: { type: "string" },
              automatic: outcomeDraftSchema(),
              blocked: outcomeDraftSchema(),
              outcomes: {
                type: "object",
                additionalProperties: false,
                properties: Object.fromEntries(
                  outcomeTiers.map((tier) => [tier, outcomeDraftSchema()]),
                ),
                required: outcomeTiers,
              },
            },
            required: [
              "resolutionMode",
              "difficulty",
              "attribute",
              "category",
              "circumstance",
              "risk",
              "timeCost",
              "moralIntent",
              "moralWeight",
              "growthEligible",
              "socialImpact",
              "sceneTrigger",
              "sceneContext",
              "automatic",
              "blocked",
              "outcomes",
            ],
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
    .find((content) => content.type === "output_text")?.text;
  return outputText ? (JSON.parse(outputText) as ActionPlan) : null;
}

function normalizePlan(
  plan: ActionPlan,
  intent: string,
  eventContext: string | null,
  gift: string,
): ActionPlan {
  if (impossibleClaim(intent)) {
    return localPlan(intent, eventContext, null);
  }

  const giftViolation = giftRuleViolation(intent, gift);
  if (giftViolation) {
    return blockedActionPlan(giftViolation);
  }

  const requestedScene = obviousSceneRequest(intent, Boolean(eventContext));
  if (requestedScene) {
    return {
      ...plan,
      resolutionMode: "scene",
      sceneTrigger: requestedScene,
      sceneContext: plan.sceneContext.trim() || intent.slice(0, 100),
      socialImpact: "none",
      moralWeight: "none",
      growthEligible: false,
    };
  }

  if (eventContext && plan.resolutionMode === "scene") {
    return { ...plan, resolutionMode: "automatic", sceneTrigger: "none" };
  }

  if (obviousAutomatic(intent) && plan.resolutionMode === "check") {
    return { ...plan, resolutionMode: "automatic" };
  }

  if (isGiftPractice(intent)) {
    return {
      ...plan,
      resolutionMode: "check",
      attribute: "Gift Mastery",
      category: "gift",
      timeCost: "session",
      growthEligible: true,
      sceneTrigger: "none",
      sceneContext: "",
    };
  }

  if (plan.resolutionMode === "automatic" && closesScene(intent)) {
    return {
      ...plan,
      automatic: { ...plan.automatic, sceneDisposition: "end" },
    };
  }

  return plan;
}

function calculateDistribution(
  difficulty: Difficulty,
  skill: number,
  circumstance: Circumstance,
  risk: Risk,
): OutcomeWeights {
  const clean = clamp(
    Math.round(
      baseCleanChance[difficulty] +
        clamp(skill, 0, 100) * 0.45 +
        circumstanceModifier[circumstance],
    ),
    3,
    90,
  );
  const mixed = Math.min(mixedChance[risk], 98 - clean);
  const negative = 100 - clean - mixed;
  const breakthrough = clamp(
    Math.round(clean * clamp(0.08 + skill / 500, 0.08, 0.28)),
    1,
    Math.min(20, clean - 1),
  );
  const success = clean - breakthrough;
  const minimumMajorSetback = risk === "safe" ? 0 : 1;
  const majorSetback =
    negative <= 1
      ? negative
      : clamp(
          Math.round(
            negative *
              majorSetbackShare[risk] *
              clamp(1 - skill * 0.004, 0.6, 1),
          ),
          minimumMajorSetback,
          negative - 1,
        );

  return {
    major_setback: majorSetback,
    setback: negative - majorSetback,
    mixed,
    success,
    breakthrough,
  };
}

function selectOutcome(distribution: OutcomeWeights, roll: number): OutcomeTier {
  let cumulative = 0;
  for (const tier of outcomeTiers) {
    cumulative += distribution[tier];
    if (roll <= cumulative) return tier;
  }
  return "breakthrough";
}

function relationshipDelta(
  reaction: RelationshipReaction,
  socialImpact: SocialImpact,
  npcContext: unknown,
) {
  if (socialImpact === "none" || !npcContext || typeof npcContext !== "object") {
    return 0;
  }

  const values: Record<RelationshipReaction, number> = {
    very_negative: -7,
    negative: -3,
    neutral: 0,
    positive: 3,
    very_positive: 5,
  };
  const raw = values[reaction];
  const limited =
    socialImpact === "minor"
      ? clamp(raw, -2, 2)
      : raw;
  const difficulty = (npcContext as Record<string, unknown>).socialDifficulty;

  if (limited > 0) {
    return Math.max(
      1,
      Math.round(
        limited * (difficulty === "easy" ? 1.3 : difficulty === "hard" ? 0.65 : 1),
      ),
    );
  }
  if (limited < 0) {
    return Math.round(
      limited * (difficulty === "easy" ? 0.8 : difficulty === "hard" ? 1.2 : 1),
    );
  }
  return 0;
}

function fateDelta(plan: ActionPlan) {
  if (plan.moralWeight === "none" || plan.moralIntent === "neutral") return 0;
  const magnitude = plan.moralWeight === "major" ? 2 : 1;
  return plan.moralIntent === "heroic" ? magnitude : -magnitude;
}

function growthGain(
  plan: ActionPlan,
  tier: OutcomeTier | null,
  skill: number,
) {
  if (
    plan.resolutionMode !== "check" ||
    !plan.growthEligible ||
    (plan.timeCost !== "session" && plan.timeCost !== "day") ||
    !tier
  ) {
    return 0;
  }

  const outcomeMultiplier: Record<OutcomeTier, number> = {
    major_setback: 0,
    setback: 0,
    mixed: 0.45,
    success: 0.8,
    breakthrough: 1.2,
  };
  const difficultyMultiplier: Record<Difficulty, number> = {
    easy: 0.45,
    standard: 0.65,
    hard: 0.82,
    extreme: 1,
  };
  const diminishingReturns = clamp(1 - skill / 125, 0.12, 1);
  return Number(
    (outcomeMultiplier[tier] * difficultyMultiplier[plan.difficulty] * diminishingReturns).toFixed(2),
  );
}

function ensureIntroduction(
  selected: OutcomeDraft,
  npcContext: unknown,
  introduced: boolean,
) {
  const name = npcName(npcContext);
  if (introduced || !name) return selected;
  return {
    ...selected,
    narration: `“I’m ${firstName(name)}, by the way,” the child says. ${selected.narration}`,
  };
}

export async function POST(request: Request) {
  const body = (await request.json()) as Record<string, unknown>;
  const intent =
    typeof body.intent === "string" ? body.intent.trim().slice(0, 300) : "";
  if (!intent) {
    return Response.json({ error: "An action is required." }, { status: 400 });
  }

  const age = typeof body.age === "number" ? clamp(body.age, 8, 100) : 8;
  const gift = typeof body.gift === "string" ? body.gift.slice(0, 80) : "Unknown";
  const giftDescription =
    typeof body.giftDescription === "string"
      ? body.giftDescription.slice(0, 300)
      : "No additional mechanics supplied.";
  const incomingAttributes =
    body.attributes && typeof body.attributes === "object"
      ? (body.attributes as Record<string, unknown>)
      : {};
  const attributes = Object.fromEntries(
    attributeNames.map((attribute) => [
      attribute,
      typeof incomingAttributes[attribute] === "number"
        ? clamp(incomingAttributes[attribute], 0, 100)
        : 0,
    ]),
  ) as Record<AttributeName, number>;
  const giftMastery =
    typeof body.giftMastery === "number" ? clamp(body.giftMastery, 0, 100) : 0;
  const fateScore =
    typeof body.fateScore === "number" ? clamp(body.fateScore, -100, 100) : 0;
  const eventContext =
    typeof body.eventContext === "string" ? body.eventContext.slice(0, 800) : null;
  const recentContext = Array.isArray(body.recentContext)
    ? body.recentContext.slice(-8)
    : [];
  const npcContext =
    body.npcContext && typeof body.npcContext === "object" ? body.npcContext : null;
  const introduced = npcWasIntroduced(npcContext, eventContext, recentContext);

  const context = {
    player: {
      name: typeof body.playerName === "string" ? body.playerName.slice(0, 100) : "the player",
      gender: typeof body.gender === "string" ? body.gender.slice(0, 30) : "unspecified",
      age,
      gift,
      giftRules: giftDescription,
      attributes,
      giftMastery,
      fateScore,
    },
    clock: body.clock && typeof body.clock === "object" ? body.clock : null,
    story: body.story && typeof body.story === "object" ? body.story : null,
    activeScene: eventContext
      ? {
          currentBeat: eventContext,
          npc: npcContext,
          npcIsIntroduced: introduced,
          recentContext,
        }
      : null,
    attemptedAction: intent,
  };

  const generated = await generatePlan(context).catch(() => null);
  const plan = normalizePlan(
    generated ?? localPlan(intent, eventContext, npcContext),
    intent,
    eventContext,
    gift,
  );
  const skill =
    plan.attribute === "Gift Mastery"
      ? giftMastery
      : attributes[plan.attribute];
  const distribution =
    plan.resolutionMode === "check"
      ? calculateDistribution(plan.difficulty, skill, plan.circumstance, plan.risk)
      : null;
  const roll = distribution ? randomInt(100) : null;
  const outcome = distribution && roll ? selectOutcome(distribution, roll) : null;
  const rawSelected =
    outcome
      ? plan.outcomes[outcome]
      : plan.resolutionMode === "blocked"
        ? plan.blocked
        : plan.automatic;
  const selected = ensureIntroduction(rawSelected, npcContext, introduced);
  const socialImpact = plan.resolutionMode === "blocked" ? "none" : plan.socialImpact;

  return Response.json({
    mode: plan.resolutionMode,
    outcome,
    distribution,
    roll,
    cleanChance: distribution
      ? distribution.success + distribution.breakthrough
      : null,
    difficulty: plan.resolutionMode === "check" ? plan.difficulty : null,
    attribute: plan.attribute,
    category: plan.category,
    timeCost: plan.resolutionMode === "blocked" ? "moment" : plan.timeCost,
    sceneDisposition:
      plan.resolutionMode === "blocked" ? "continue" : selected.sceneDisposition,
    sceneRequest:
      plan.resolutionMode === "scene" && plan.sceneTrigger !== "none"
        ? {
            trigger: plan.sceneTrigger,
            context: plan.sceneContext.trim() || intent.slice(0, 100),
          }
        : null,
    narration: selected.narration,
    gain: growthGain(plan, outcome, skill),
    fateDelta: plan.resolutionMode === "blocked" ? 0 : fateDelta(plan),
    relationshipDelta: relationshipDelta(selected.reaction, socialImpact, npcContext),
    socialImpact,
    npcThought: socialImpact === "none" ? null : selected.thought,
    npcMemory: socialImpact === "none" ? null : selected.memory,
  });
}
