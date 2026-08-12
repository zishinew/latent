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
type RoutineKind = "body" | "study" | "gift";
type CheckSource = "routine" | "event" | "action";
type BeatIntensity = "calm" | "low" | "medium" | "high";
type StatGain = { stat: SkillName; amount: number };
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

function routineKind(intent: string, hasActiveScene: boolean): RoutineKind | null {
  if (hasActiveScene) return null;
  const normalized = intent.toLocaleLowerCase();
  if (isGiftPractice(intent)) return "gift";
  if (/\b(?:study|studying|homework|revise|revision)\b/.test(normalized)) {
    return "study";
  }
  if (
    /\b(?:train|training|workout|work out|exercise|push.?ups?|lift|conditioning)\b/.test(
      normalized,
    )
  ) {
    return "body";
  }
  return null;
}

function closesScene(intent: string) {
  return /\b(?:goodbye|farewell|leave|walk away|head home|go home|end (?:the |this )?(?:conversation|interaction)|return to (?:watching|observing|my day))\b/i.test(
    intent,
  );
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
    return blockedActionPlan(
      "That outcome cannot be declared into existence. You can attempt one immediate step toward it, but progress still has to be earned.",
    );
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

function currentStat(
  stat: SkillName,
  attributes: Record<AttributeName, number>,
  giftMastery: number,
) {
  return stat === "Gift Mastery" ? giftMastery : attributes[stat];
}

function statGain(
  stat: SkillName,
  rawAmount: number,
  attributes: Record<AttributeName, number>,
  giftMastery: number,
): StatGain | null {
  const room = Math.max(0, 100 - currentStat(stat, attributes, giftMastery));
  const amount = Number(Math.min(room, Math.max(0, rawAmount)).toFixed(2));
  return amount > 0 ? { stat, amount } : null;
}

function compactGrowth(growth: Array<StatGain | null>) {
  return growth.filter((entry): entry is StatGain => entry !== null);
}

function routineTarget(kind: RoutineKind): SkillName {
  if (kind === "study") return "Intelligence";
  if (kind === "gift") return "Gift Mastery";
  return "Strength";
}

function routineDifficulty(target: number): Difficulty {
  if (target < 25) return "easy";
  if (target < 55) return "standard";
  if (target < 80) return "hard";
  return "extreme";
}

function routineDistribution(
  kind: RoutineKind,
  attributes: Record<AttributeName, number>,
  giftMastery: number,
): OutcomeWeights {
  const target = currentStat(routineTarget(kind), attributes, giftMastery);
  const intelligence = attributes.Intelligence;
  const willpower = attributes.Willpower;
  const specializedSupport =
    kind === "body"
      ? attributes.Vigor * 0.05 + attributes.Agility * 0.03
      : kind === "study"
        ? attributes.Rapport * 0.02
        : attributes.Vigor * 0.02;
  const support = intelligence * 0.14 + willpower * 0.08 + specializedSupport;
  const clean = clamp(Math.round(58 + support - target * 0.52), 18, 75);
  const mixed = 20;
  const negative = 100 - clean - mixed;
  const breakthrough = clamp(
    Math.round(clean * clamp(0.08 + intelligence / 500 + willpower / 1000, 0.08, 0.25)),
    2,
    Math.max(2, clean - 1),
  );
  const majorSetback = Math.max(1, Math.round(negative * 0.08));

  return {
    major_setback: majorSetback,
    setback: negative - majorSetback,
    mixed,
    success: clean - breakthrough,
    breakthrough,
  };
}

function routineGrowth(
  kind: RoutineKind,
  tier: OutcomeTier,
  attributes: Record<AttributeName, number>,
  giftMastery: number,
) {
  const base: Record<OutcomeTier, number> = {
    major_setback: 0,
    setback: 0,
    mixed: 0.22,
    success: 0.42,
    breakthrough: 0.75,
  };
  const targetStat = routineTarget(kind);
  const target = currentStat(targetStat, attributes, giftMastery);
  const learnability = 0.1 + 0.9 * Math.pow(1 - target / 100, 1.35);
  const efficiency = 0.82 + attributes.Intelligence / 250 + attributes.Willpower / 500;
  const primary = base[tier] * learnability * efficiency;

  if (kind === "body") {
    return compactGrowth([
      statGain("Strength", primary, attributes, giftMastery),
      statGain("Vigor", primary * 0.28, attributes, giftMastery),
      statGain("Agility", primary * 0.15, attributes, giftMastery),
    ]);
  }
  if (kind === "study") {
    return compactGrowth([
      statGain("Intelligence", primary, attributes, giftMastery),
      statGain("Willpower", primary * 0.14, attributes, giftMastery),
    ]);
  }
  return compactGrowth([
    statGain("Gift Mastery", primary, attributes, giftMastery),
    statGain("Willpower", primary * 0.2, attributes, giftMastery),
    statGain("Intelligence", primary * 0.1, attributes, giftMastery),
  ]);
}

function routineNarration(kind: RoutineKind, tier: OutcomeTier) {
  const copy: Record<RoutineKind, Record<OutcomeTier, string>> = {
    body: {
      major_setback: "Your form breaks down early, and stopping before you reinforce a bad habit is the only useful choice.",
      setback: "The workout never finds a steady rhythm. You finish tired, but without meaningful improvement.",
      mixed: "The session is uneven, yet a few repetitions finally begin to feel controlled and repeatable.",
      success: "You pace the workout well, correct your form between sets, and finish with measurable progress.",
      breakthrough: "Everything aligns—breathing, balance, and timing—and the session reveals a much more efficient way to train.",
    },
    study: {
      major_setback: "The material blurs together until continuing would only reinforce the wrong ideas, so you stop and reset.",
      setback: "You put in the time, but the lesson never settles into a form you can reliably use.",
      mixed: "Some of the lesson remains tangled, though one difficult idea finally starts to make sense.",
      success: "You organize the material, test what you remember, and finish with a stronger grasp of the subject.",
      breakthrough: "A connection between several ideas suddenly clicks, turning the rest of the lesson into something you can navigate confidently.",
    },
    gift: {
      major_setback: "Your Gift refuses to settle into a safe pattern, and you end the session before bad control becomes a habit.",
      setback: "You repeat the exercise carefully, but your control remains exactly where it began.",
      mixed: "Your control wavers, yet one brief attempt feels deliberate enough to repeat later.",
      success: "You isolate one part of your Gift, repeat it under control, and leave with a clearer sense of its limits.",
      breakthrough: "A stubborn part of your Gift finally responds to intention instead of instinct, opening a reliable new direction for practice.",
    },
  };
  return copy[kind][tier];
}

function routineNote(kind: RoutineKind) {
  if (kind === "body") {
    return "Intelligence improves planning; Willpower, Vigor, and Agility support execution. Progress slows as Strength rises.";
  }
  if (kind === "study") {
    return "Intelligence shapes aptitude while Willpower sustains focus. Familiar material yields less new growth.";
  }
  return "Intelligence improves experimentation and Willpower stabilizes control. Gift Mastery becomes harder to raise near mastery.";
}

function eventGrowth(
  stat: SkillName,
  tier: OutcomeTier,
  difficulty: Difficulty,
  intensity: BeatIntensity,
  attributes: Record<AttributeName, number>,
  giftMastery: number,
) {
  const base: Record<OutcomeTier, number> = {
    major_setback: 0,
    setback: 0,
    mixed: 0.75,
    success: 1.35,
    breakthrough: 2.2,
  };
  const intensityMultiplier: Record<BeatIntensity, number> = {
    calm: 1.5,
    low: 1.7,
    medium: 2,
    high: 2.3,
  };
  const difficultyMultiplier: Record<Difficulty, number> = {
    easy: 0.9,
    standard: 1,
    hard: 1.12,
    extreme: 1.25,
  };
  const target = currentStat(stat, attributes, giftMastery);
  const learnability = 0.12 + 0.88 * Math.pow(1 - target / 100, 1.15);
  const reflection = 0.9 + attributes.Intelligence / 500;
  const primary =
    base[tier] *
    intensityMultiplier[intensity] *
    difficultyMultiplier[difficulty] *
    learnability *
    reflection;
  const related: Partial<Record<SkillName, number>> = {
    "Gift Mastery": 0,
  };

  if (stat === "Gift Mastery") {
    related.Willpower = 0.24;
    related.Intelligence = 0.14;
  } else if (stat === "Strength") {
    related.Vigor = 0.25;
    related.Agility = 0.12;
  } else if (stat === "Agility") {
    related.Vigor = 0.18;
    related.Willpower = 0.12;
  } else if (stat === "Vigor") {
    related.Strength = 0.18;
    related.Willpower = 0.12;
  } else if (stat === "Intelligence") {
    related.Willpower = 0.18;
  } else if (stat === "Willpower") {
    related.Vigor = 0.12;
    related.Intelligence = 0.1;
  } else if (stat === "Rapport") {
    related.Willpower = 0.15;
    related.Intelligence = 0.08;
  }

  return compactGrowth([
    statGain(stat, primary, attributes, giftMastery),
    ...Object.entries(related)
      .filter(([, multiplier]) => multiplier && multiplier > 0)
      .map(([relatedStat, multiplier]) =>
        statGain(
          relatedStat as SkillName,
          primary * (multiplier ?? 0),
          attributes,
          giftMastery,
        ),
      ),
  ]);
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
  const eventMeta =
    body.eventMeta && typeof body.eventMeta === "object"
      ? (body.eventMeta as Record<string, unknown>)
      : null;
  const sceneState =
    body.sceneState && typeof body.sceneState === "object"
      ? (body.sceneState as Record<string, unknown>)
      : null;
  const sceneGoalStatus = sceneState?.goalStatus;
  const unresolvedSceneGoal =
    Boolean(eventContext && sceneState) &&
    sceneGoalStatus !== "resolved" &&
    sceneGoalStatus !== "abandoned";
  const eventIntensity: BeatIntensity =
    eventMeta && ["calm", "low", "medium", "high"].includes(String(eventMeta.intensity))
      ? (eventMeta.intensity as BeatIntensity)
      : "low";
  const recentContext = Array.isArray(body.recentContext)
    ? body.recentContext.slice(-8)
    : [];
  const npcContext =
    body.npcContext && typeof body.npcContext === "object" ? body.npcContext : null;
  const introduced = npcWasIntroduced(npcContext, eventContext, recentContext);
  const routine = routineKind(intent, Boolean(eventContext));

  if (routine) {
    const target = routineTarget(routine);
    const distribution = routineDistribution(routine, attributes, giftMastery);
    const roll = randomInt(100);
    const outcome = selectOutcome(distribution, roll);
    const growth = routineGrowth(routine, outcome, attributes, giftMastery);
    const difficulty = routineDifficulty(
      currentStat(target, attributes, giftMastery),
    );

    return Response.json({
      mode: "check",
      outcome,
      distribution,
      roll,
      cleanChance: distribution.success + distribution.breakthrough,
      difficulty,
      attribute: target,
      category:
        routine === "gift" ? "gift" : routine === "study" ? "study" : "physical",
      checkSource: "routine" satisfies CheckSource,
      calculationNote: routineNote(routine),
      timeCost: "session",
      sceneDisposition: "end",
      sceneRequest: null,
      narration: routineNarration(routine, outcome),
      growth,
      gain: growth.find((entry) => entry.stat === target)?.amount ?? 0,
      fateDelta: 0,
      relationshipDelta: 0,
      socialImpact: "none",
      npcThought: null,
      npcMemory: null,
    });
  }

  if (!process.env.OPENAI_API_KEY) {
    return Response.json(
      { error: "AI is not configured. Add an API key before resolving this action." },
      { status: 503 },
    );
  }

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
          sceneGoal:
            typeof sceneState?.sceneGoal === "string"
              ? sceneState.sceneGoal.slice(0, 240)
              : null,
          goalStatus:
            typeof sceneGoalStatus === "string" ? sceneGoalStatus : null,
          turns:
            typeof sceneState?.turns === "number" ? sceneState.turns : null,
          targetTurns:
            typeof sceneState?.targetTurns === "number"
              ? sceneState.targetTurns
              : null,
          npc: npcContext,
          npcIsIntroduced: introduced,
          recentContext,
        }
      : null,
    attemptedAction: intent,
  };

  const generated = await generatePlan(context).catch(() => null);
  if (!generated) {
    return Response.json(
      { error: "AI is unavailable right now. Please try again." },
      { status: 502 },
    );
  }
  const plan = normalizePlan(
    generated,
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
  const isEventCheck = Boolean(eventContext) && plan.resolutionMode === "check";
  const standardGain = growthGain(plan, outcome, skill);
  const growth = outcome
    ? isEventCheck
      ? eventGrowth(
          plan.attribute,
          outcome,
          plan.difficulty,
          eventIntensity,
          attributes,
          giftMastery,
        )
      : compactGrowth([
          statGain(plan.attribute, standardGain, attributes, giftMastery),
        ])
    : [];

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
    checkSource: (isEventCheck ? "event" : "action") satisfies CheckSource,
    calculationNote: isEventCheck
      ? "Real-world pressure creates accelerated growth. Difficulty, intensity, Intelligence, and current mastery shape what is learned."
      : "The outcome is based on the relevant skill, difficulty, risk, and established circumstances.",
    timeCost: plan.resolutionMode === "blocked" ? "moment" : plan.timeCost,
    sceneDisposition:
      plan.resolutionMode === "blocked" ||
      (unresolvedSceneGoal && !closesScene(intent))
        ? "continue"
        : selected.sceneDisposition,
    sceneRequest:
      plan.resolutionMode === "scene" && plan.sceneTrigger !== "none"
        ? {
            trigger: plan.sceneTrigger,
            context: plan.sceneContext.trim() || intent.slice(0, 100),
          }
        : null,
    narration: selected.narration,
    growth,
    gain: growth.find((entry) => entry.stat === plan.attribute)?.amount ?? 0,
    fateDelta: plan.resolutionMode === "blocked" ? 0 : fateDelta(plan),
    relationshipDelta: relationshipDelta(selected.reaction, socialImpact, npcContext),
    socialImpact,
    npcThought: socialImpact === "none" ? null : selected.thought,
    npcMemory: socialImpact === "none" ? null : selected.memory,
  });
}
