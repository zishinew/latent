import { actionRefereePrompt } from "../../game-prompts";
import {
  concealUndiscoveredNpcName,
  containsNpcIntroduction,
  revealNpcAtIntroduction,
} from "../../npc-visibility";
import {
  crushStyles,
  npcArchetypes,
  socialDifficulties,
  type NpcArchetype,
  type CrushStyle,
  type NpcProfile,
  type SocialDifficulty,
} from "../../characters";
import { generateQwenJson, getQwenApiKey } from "../../qwen";
import { isAtLocation, travelDestination, travelNarration } from "../../travel";

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
type ResolutionMode = "automatic" | "check" | "blocked";
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
type CheckSource = "routine" | "action";
type StatGain = { stat: SkillName; amount: number };
type GeneratedNpc = Omit<NpcProfile, "id">;
type KnownCharacter = NpcProfile & {
  level: number;
  memories: string[];
};
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
  focalNpc: GeneratedNpc | null;
  location: string | null;
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
  explicitState?: boolean,
) {
  if (typeof explicitState === "boolean") return explicitState;
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
    focalNpc: null,
    location: null,
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

function isGiftPractice(intent: string) {
  const normalized = intent.toLocaleLowerCase();
  const practiceVerb = /\b(?:practice|train|training|exercise|develop|improve|work on|experiment with)\b/;
  const giftTerm = /\b(?:gift|power|ability)\b/;
  return practiceVerb.test(normalized) && giftTerm.test(normalized);
}

function routineKind(intent: string): RoutineKind | null {
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

function shortStrings(value: unknown, count: number, length = 120) {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.slice(0, length))
        .slice(0, count)
    : [];
}

function npcId(name: string) {
  const slug =
    name
      .toLocaleLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "character";
  return `${slug}-${Math.random().toString(36).slice(2, 7)}`;
}

const npcSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    name: { type: "string" },
    age: { type: "number" },
    archetype: { type: "string", enum: npcArchetypes },
    traits: { type: "array", minItems: 3, maxItems: 3, items: { type: "string" } },
    values: { type: "array", minItems: 2, maxItems: 2, items: { type: "string" } },
    likes: { type: "array", minItems: 2, maxItems: 2, items: { type: "string" } },
    dislikes: { type: "array", minItems: 2, maxItems: 2, items: { type: "string" } },
    socialDifficulty: { type: "string", enum: socialDifficulties },
    voice: { type: "string" },
    privateGoal: { type: "string" },
    insecurity: { type: "string" },
    crushStyle: { type: "string", enum: crushStyles },
  },
  required: [
    "name",
    "age",
    "archetype",
    "traits",
    "values",
    "likes",
    "dislikes",
    "socialDifficulty",
    "voice",
    "privateGoal",
    "insecurity",
    "crushStyle",
  ],
} as const;

function generatedNpc(value: unknown): GeneratedNpc | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (typeof item.name !== "string" || !item.name.trim()) return null;
  return {
    name: item.name.trim().slice(0, 80),
    age: typeof item.age === "number" ? clamp(item.age, 5, 100) : 8,
    archetype: npcArchetypes.includes(item.archetype as NpcArchetype)
      ? (item.archetype as NpcArchetype)
      : "dandere",
    traits:
      shortStrings(item.traits, 3, 100).length === 3
        ? shortStrings(item.traits, 3, 100)
        : ["observant", "reserved", "curious"],
    values:
      shortStrings(item.values, 2, 100).length === 2
        ? shortStrings(item.values, 2, 100)
        : ["patience", "fairness"],
    likes:
      shortStrings(item.likes, 2, 100).length === 2
        ? shortStrings(item.likes, 2, 100)
        : ["small projects", "quiet places"],
    dislikes:
      shortStrings(item.dislikes, 2, 100).length === 2
        ? shortStrings(item.dislikes, 2, 100)
        : ["being rushed", "being mocked"],
    socialDifficulty: socialDifficulties.includes(
      item.socialDifficulty as SocialDifficulty,
    )
      ? (item.socialDifficulty as SocialDifficulty)
      : "standard",
    voice:
      typeof item.voice === "string" && item.voice.trim()
        ? item.voice.slice(0, 240)
        : "Brief, concrete sentences with pauses before answering.",
    privateGoal:
      typeof item.privateGoal === "string" && item.privateGoal.trim()
        ? item.privateGoal.slice(0, 240)
        : "Finish the small task they started without attracting ridicule.",
    insecurity:
      typeof item.insecurity === "string" && item.insecurity.trim()
        ? item.insecurity.slice(0, 240)
        : "Being laughed at for caring too much about a small project.",
    crushStyle: crushStyles.includes(item.crushStyle as CrushStyle)
      ? (item.crushStyle as CrushStyle)
      : "oblivious",
  };
}

function parseNpcProfile(value: unknown): NpcProfile | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (
    typeof item.id !== "string" ||
    typeof item.name !== "string" ||
    typeof item.age !== "number" ||
    !npcArchetypes.includes(item.archetype as NpcArchetype) ||
    !socialDifficulties.includes(item.socialDifficulty as SocialDifficulty) ||
    !crushStyles.includes(item.crushStyle as CrushStyle) ||
    typeof item.voice !== "string" ||
    typeof item.privateGoal !== "string" ||
    typeof item.insecurity !== "string"
  ) {
    return null;
  }
  return {
    id: item.id.slice(0, 80),
    name: item.name.slice(0, 80),
    age: clamp(item.age, 5, 100),
    archetype: item.archetype as NpcArchetype,
    traits: shortStrings(item.traits, 3, 100),
    values: shortStrings(item.values, 2, 100),
    likes: shortStrings(item.likes, 2, 100),
    dislikes: shortStrings(item.dislikes, 2, 100),
    socialDifficulty: item.socialDifficulty as SocialDifficulty,
    voice: item.voice.slice(0, 240),
    privateGoal: item.privateGoal.slice(0, 240),
    insecurity: item.insecurity.slice(0, 240),
    crushStyle: item.crushStyle as CrushStyle,
  };
}

function attachNpcId(
  generated: GeneratedNpc,
  identities: NpcProfile[],
): NpcProfile {
  const match = identities.find(
    (identity) =>
      identity.name.toLocaleLowerCase() === generated.name.toLocaleLowerCase(),
  );
  return match ?? { ...generated, id: npcId(generated.name) };
}

const actionPlanSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    resolutionMode: {
      type: "string",
      enum: ["automatic", "check", "blocked"],
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
    focalNpc: { anyOf: [npcSchema, { type: "null" }] },
    location: { anyOf: [{ type: "string" }, { type: "null" }] },
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
    "focalNpc",
    "location",
    "automatic",
    "blocked",
    "outcomes",
  ],
};

function oneOf<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === "string" && values.includes(value as T);
}

function parseOutcomeDraft(value: unknown): OutcomeDraft | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const reactions: RelationshipReaction[] = [
    "very_negative",
    "negative",
    "neutral",
    "positive",
    "very_positive",
  ];
  if (
    typeof item.narration !== "string" ||
    !item.narration.trim() ||
    !oneOf(item.reaction, reactions) ||
    (item.thought !== null && typeof item.thought !== "string") ||
    (item.memory !== null && typeof item.memory !== "string") ||
    !oneOf(item.sceneDisposition, ["continue", "end"] as const)
  ) {
    return null;
  }
  return {
    narration: item.narration.trim().slice(0, 800),
    reaction: item.reaction,
    thought: typeof item.thought === "string" ? item.thought.slice(0, 300) : null,
    memory: typeof item.memory === "string" ? item.memory.slice(0, 300) : null,
    sceneDisposition: item.sceneDisposition,
  };
}

function parseActionPlan(value: Record<string, unknown>): ActionPlan | null {
  const modes: ResolutionMode[] = ["automatic", "check", "blocked"];
  const difficulties: Difficulty[] = ["easy", "standard", "hard", "extreme"];
  const categories: Category[] = [
    "physical",
    "study",
    "gift",
    "social",
    "exploration",
    "conversation",
    "movement",
    "other",
  ];
  const circumstances: Circumstance[] = [
    "major_disadvantage",
    "disadvantage",
    "neutral",
    "advantage",
    "major_advantage",
  ];
  const risks: Risk[] = ["safe", "low", "meaningful", "high"];
  const timeCosts: TimeCost[] = ["moment", "short", "session", "day"];
  const moralIntents: MoralIntent[] = ["heroic", "neutral", "selfish", "cruel"];
  const moralWeights: MoralWeight[] = ["none", "minor", "major"];
  const socialImpacts: SocialImpact[] = ["none", "minor", "meaningful"];
  const automatic = parseOutcomeDraft(value.automatic);
  const blocked = parseOutcomeDraft(value.blocked);
  const rawOutcomes =
    value.outcomes && typeof value.outcomes === "object"
      ? (value.outcomes as Record<string, unknown>)
      : null;
  const outcomeEntries = rawOutcomes
    ? outcomeTiers.map((tier) => [tier, parseOutcomeDraft(rawOutcomes[tier])] as const)
    : [];
  const hasCompleteOutcomes =
    outcomeEntries.length === outcomeTiers.length &&
    outcomeEntries.every(([, outcome]) => outcome !== null);
  const unusedDraft = draft(
    "The immediate moment passes without any additional consequence.",
  );
  const resolvedAutomatic = automatic ?? unusedDraft;
  const resolvedBlocked = blocked ?? unusedDraft;
  const resolvedOutcomes = hasCompleteOutcomes
    ? (Object.fromEntries(outcomeEntries) as Record<OutcomeTier, OutcomeDraft>)
    : Object.fromEntries(
        outcomeTiers.map((tier) => [tier, resolvedAutomatic]),
      ) as Record<OutcomeTier, OutcomeDraft>;
  const rawNpc = value.focalNpc;
  const focalNpc =
    rawNpc === null || rawNpc === undefined ? null : generatedNpc(rawNpc);
  const location =
    typeof value.location === "string"
      ? value.location.trim().slice(0, 100) || null
      : null;

  if (
    !oneOf(value.resolutionMode, modes) ||
    !oneOf(value.difficulty, difficulties) ||
    !oneOf(value.attribute, skillNames) ||
    !oneOf(value.category, categories) ||
    !oneOf(value.circumstance, circumstances) ||
    !oneOf(value.risk, risks) ||
    !oneOf(value.timeCost, timeCosts) ||
    !oneOf(value.moralIntent, moralIntents) ||
    !oneOf(value.moralWeight, moralWeights) ||
    typeof value.growthEligible !== "boolean" ||
    !oneOf(value.socialImpact, socialImpacts) ||
    (value.resolutionMode === "automatic" && !automatic) ||
    (value.resolutionMode === "blocked" && !blocked) ||
    (value.resolutionMode === "check" && !hasCompleteOutcomes)
  ) {
    return null;
  }

  return {
    resolutionMode: value.resolutionMode,
    difficulty: value.difficulty,
    attribute: value.attribute,
    category: value.category,
    circumstance: value.circumstance,
    risk: value.risk,
    timeCost: value.timeCost,
    moralIntent: value.moralIntent,
    moralWeight: value.moralWeight,
    growthEligible: value.growthEligible,
    socialImpact: value.socialImpact,
    focalNpc,
    location,
    automatic: resolvedAutomatic,
    blocked: resolvedBlocked,
    outcomes: resolvedOutcomes,
  };
}

async function generatePlan(
  context: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<ActionPlan | null> {
  return generateQwenJson<ActionPlan>({
    label: "action plan",
    system: actionRefereePrompt,
    context,
    schema: actionPlanSchema,
    signal,
    parse: parseActionPlan,
  });
}

function normalizePlan(
  plan: ActionPlan,
  intent: string,
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

  if (isGiftPractice(intent)) {
    return {
      ...plan,
      resolutionMode: "check",
      attribute: "Gift Mastery",
      category: "gift",
      timeCost: "session",
      growthEligible: true,
    };
  }

  if (
    plan.resolutionMode === "automatic" &&
    closesScene(intent) &&
    !travelDestination(intent)
  ) {
    return {
      ...plan,
      automatic: { ...plan.automatic, sceneDisposition: "end" },
    };
  }

  return plan;
}

function travelPlan(
  plan: ActionPlan,
  intent: string,
  location: string | null,
): ActionPlan {
  const destination = travelDestination(intent);
  if (!destination) return plan;
  const atLocation = isAtLocation(destination, location);
  const disposition: SceneDisposition = atLocation ? "continue" : "end";

  if (plan.resolutionMode !== "blocked" && plan.resolutionMode !== "check") {
    return plan.resolutionMode === "automatic"
      ? {
          ...plan,
          automatic: { ...plan.automatic, sceneDisposition: disposition },
        }
      : plan;
  }

  const moment = draft(travelNarration(destination, atLocation), disposition);
  return {
    ...plan,
    resolutionMode: "automatic",
    category: "movement",
    timeCost: "short",
    moralIntent: "neutral",
    moralWeight: "none",
    growthEligible: false,
    socialImpact: "none",
    focalNpc: null,
    automatic: moment,
    blocked: moment,
    outcomes: Object.fromEntries(
      outcomeTiers.map((tier) => [tier, moment]),
    ) as Record<OutcomeTier, OutcomeDraft>,
  };
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

const attributeDetection: Array<{ attribute: AttributeName; pattern: RegExp }> = [
  {
    attribute: "Strength",
    pattern: /\b(?:strength|strengthen|muscle|raw power|brute force)\b/i,
  },
  {
    attribute: "Agility",
    pattern: /\b(?:agility|agile|speed|reflexes|nimbleness|footwork)\b/i,
  },
  {
    attribute: "Willpower",
    pattern: /\b(?:willpower|will power|resolve|mental fortitude|discipline)\b/i,
  },
  {
    attribute: "Intelligence",
    pattern: /\b(?:intelligence|intellect|mental acuity|cleverness|knowledge)\b/i,
  },
  {
    attribute: "Vigor",
    pattern: /\b(?:vigor|stamina|endurance|fitness|breath control)\b/i,
  },
  {
    attribute: "Rapport",
    pattern: /\b(?:rapport|charisma|charm|people skills|sociability|persuasion)\b/i,
  },
];

const practiceIntentPattern =
  /\b(?:focus on|work on|practice|train|training|workout|work out|exercise|study|studying|revise|develop|improve|drill|condition|hone|sharpen|push.?ups?|lift)\b/i;

function routineAttribute(intent: string): AttributeName | null {
  if (!practiceIntentPattern.test(intent)) return null;
  const normalized = intent.toLocaleLowerCase();
  let earliest: { index: number; attribute: AttributeName } | null = null;
  for (const { attribute, pattern } of attributeDetection) {
    const match = pattern.exec(normalized);
    if (match && (earliest === null || match.index < earliest.index)) {
      earliest = { index: match.index, attribute };
    }
  }
  return earliest?.attribute ?? null;
}

function routineCategory(target: SkillName): Category {
  if (target === "Gift Mastery") return "gift";
  if (target === "Rapport") return "social";
  if (target === "Strength" || target === "Agility" || target === "Vigor") {
    return "physical";
  }
  return "study";
}

function routineSecondaryStats(target: SkillName): Array<{ stat: SkillName; weight: number }> {
  switch (target) {
    case "Strength":
      return [
        { stat: "Agility", weight: 0.15 },
        { stat: "Vigor", weight: 0.28 },
      ];
    case "Agility":
      return [
        { stat: "Vigor", weight: 0.18 },
        { stat: "Strength", weight: 0.14 },
      ];
    case "Vigor":
      return [
        { stat: "Strength", weight: 0.16 },
        { stat: "Agility", weight: 0.12 },
      ];
    case "Willpower":
      return [{ stat: "Intelligence", weight: 0.14 }];
    case "Intelligence":
      return [{ stat: "Willpower", weight: 0.14 }];
    case "Rapport":
      return [
        { stat: "Willpower", weight: 0.1 },
        { stat: "Intelligence", weight: 0.08 },
      ];
    case "Gift Mastery":
      return [
        { stat: "Willpower", weight: 0.2 },
        { stat: "Intelligence", weight: 0.1 },
      ];
  }
}

function routineDifficulty(target: number): Difficulty {
  if (target < 25) return "easy";
  if (target < 55) return "standard";
  if (target < 80) return "hard";
  return "extreme";
}

function routineDistribution(
  target: SkillName,
  attributes: Record<AttributeName, number>,
  giftMastery: number,
): OutcomeWeights {
  const value = currentStat(target, attributes, giftMastery);
  const intelligence = attributes.Intelligence;
  const willpower = attributes.Willpower;
  const overlap =
    target === "Strength"
      ? attributes.Vigor * 0.05 + attributes.Agility * 0.03
      : target === "Agility"
        ? attributes.Vigor * 0.05 + attributes.Strength * 0.03
        : target === "Rapport"
          ? attributes.Vigor * 0.02
          : target === "Vigor"
            ? attributes.Strength * 0.04 + attributes.Agility * 0.03
            : target === "Willpower"
              ? attributes.Vigor * 0.02
              : attributes.Vigor * 0.02;
  const support = intelligence * 0.14 + willpower * 0.08 + overlap;
  const clean = clamp(Math.round(58 + support - value * 0.52), 18, 75);
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
  target: SkillName,
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
  const current = currentStat(target, attributes, giftMastery);
  const learnability = 0.1 + 0.9 * Math.pow(1 - current / 100, 1.35);
  const efficiency = 0.82 + attributes.Intelligence / 250 + attributes.Willpower / 500;
  const primary = base[tier] * learnability * efficiency;

  return compactGrowth([
    statGain(target, primary, attributes, giftMastery),
    ...routineSecondaryStats(target).map(({ stat, weight }) =>
      statGain(stat, primary * weight, attributes, giftMastery),
    ),
  ]);
}

const attributeNarration: Record<
  AttributeName | "Gift Mastery",
  Record<OutcomeTier, string>
> = {
  Strength: {
    major_setback: "Your form breaks down early, and stopping before you reinforce a bad habit is the only useful choice.",
    setback: "The workout never finds a steady rhythm. You finish tired, but without meaningful improvement.",
    mixed: "The session is uneven, yet a few repetitions finally begin to feel controlled and repeatable.",
    success: "You pace the workout well, correct your form between sets, and finish with measurable progress.",
    breakthrough: "Everything aligns—breathing, balance, and timing—and the session reveals a much more efficient way to train.",
  },
  Agility: {
    major_setback: "Your footwork breaks down early, and you stop before a sloppy movement becomes a habit.",
    setback: "The agility drills never click. You finish quick, but not quick in any way that carries over.",
    mixed: "One sequence finally lands clean, even if most of the session stays clumsy.",
    success: "Your transitions tighten—consecutive reps feel faster and more deliberate with every round.",
    breakthrough: "A movement you've been fighting suddenly flows, and your body finds a more efficient way to shift and recover.",
  },
  Willpower: {
    major_setback: "You lose focus early, and stopping before frustration hardens into a worse habit is the only clean choice.",
    setback: "The concentration work stays shaky—your control recedes as quickly as you summon it.",
    mixed: "One difficult stretch of focus holds, even though the rest wavers.",
    success: "You hold composure through deliberate drills, catching yourself before old impulses slip in.",
    breakthrough: "You stay calm and clear through a challenge that used to shake you, and the discipline feels repeatable.",
  },
  Intelligence: {
    major_setback: "The material blurs together until continuing would only reinforce the wrong ideas, so you stop and reset.",
    setback: "You put in the time, but the lesson never settles into a form you can reliably use.",
    mixed: "Some of the lesson remains tangled, though one difficult idea finally starts to make sense.",
    success: "You organize the material, test what you remember, and finish with a stronger grasp of the subject.",
    breakthrough: "A connection between several ideas suddenly clicks, turning the rest of the lesson into something you can navigate confidently.",
  },
  Vigor: {
    major_setback: "Your stamina gives out sooner than expected, and pushing on would only invite injury—so you stop.",
    setback: "The endurance work never finds a rhythm. You finish spent, but unchanged.",
    mixed: "One sustained push outlasts the rest, a small gain you can carry forward.",
    success: "Your endurance climbs through patient work—you recover faster between efforts and finish stronger.",
    breakthrough: "You push past a familiar exhaustion and rebound far sooner than before, opening a new level of conditioning.",
  },
  Rapport: {
    major_setback: "A conversation exercise stalls completely, and you end it before awkwardness becomes a habit.",
    setback: "The social drills never land—you read the room, but the timing stays off.",
    mixed: "One exchange finally connects, giving you a small thread to build on.",
    success: "You practice attentive listening and easy conversation, and people visibly warm to you.",
    breakthrough: "A social exercise clicks into place—you read a room instantly and steer it with ease and warmth.",
  },
  "Gift Mastery": {
    major_setback: "Your Gift refuses to settle into a safe pattern, and you end the session before bad control becomes a habit.",
    setback: "You repeat the exercise carefully, but your control remains exactly where it began.",
    mixed: "Your control wavers, yet one brief attempt feels deliberate enough to repeat later.",
    success: "You isolate one part of your Gift, repeat it under control, and leave with a clearer sense of its limits.",
    breakthrough: "A stubborn part of your Gift finally responds to intention instead of instinct, opening a reliable new direction for practice.",
  },
};

function routineNarration(target: SkillName, tier: OutcomeTier) {
  return attributeNarration[target][tier];
}

function routineNote(target: SkillName) {
  if (target === "Gift Mastery") {
    return "Intelligence improves experimentation and Willpower stabilizes control. Gift Mastery becomes harder to raise near mastery.";
  }
  if (target === "Rapport") {
    return "Rapport grows through practice while Willpower and Intelligence deepen slightly. Social grace becomes harder to raise near mastery.";
  }
  return `${target} grows fastest, with related attributes improving slightly on the side. Progress slows as ${target.toLowerCase()} rises.`;
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

function resolveNpcVisibility(
  selected: OutcomeDraft,
  npcContext: unknown,
  introduced: boolean,
) {
  const name = npcName(npcContext);
  if (introduced || !name) return { draft: selected, introduced };
  if (containsNpcIntroduction(selected.narration, name)) {
    return { draft: selected, introduced: true };
  }
  const revealed = revealNpcAtIntroduction(selected.narration, name);
  if (revealed.introduced) {
    return {
      draft: { ...selected, narration: revealed.text },
      introduced: true,
    };
  }
  return {
    draft: {
      ...selected,
      narration: concealUndiscoveredNpcName(selected.narration, name),
      thought: selected.thought
        ? concealUndiscoveredNpcName(selected.thought, name)
        : null,
    },
    introduced: false,
  };
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    const parsed = (await request.json()) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    body = parsed as Record<string, unknown>;
  } catch {
    return Response.json({ error: "A valid action request is required." }, { status: 400 });
  }
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
  const currentLocation =
    typeof body.location === "string" && body.location.trim()
      ? body.location.trim().slice(0, 100)
      : null;
  const recentContext = Array.isArray(body.recentContext)
    ? body.recentContext.slice(-8)
    : [];
  const npcContextRaw =
    body.npcContext && typeof body.npcContext === "object"
      ? body.npcContext
      : null;
  const npcContext = parseNpcProfile(npcContextRaw);
  const known = Array.isArray(body.knownCharacters)
    ? body.knownCharacters
        .slice(0, 20)
        .map((value) => {
          const profile = parseNpcProfile(value);
          if (!profile) return null;
          const record = value && typeof value === "object"
            ? (value as Record<string, unknown>)
            : {};
          const level =
            typeof record.level === "number" ? clamp(record.level, -100, 100) : 0;
          const memories = Array.isArray(record.memories)
            ? record.memories
                .filter((memory): memory is string => typeof memory === "string")
                .slice(-10)
            : [];
          return { ...profile, level, memories };
        })
        .filter((character): character is KnownCharacter => character !== null)
    : [];
  const introduced = npcWasIntroduced(
    npcContext,
    null,
    recentContext,
    typeof body.npcIntroduced === "boolean" ? body.npcIntroduced : undefined,
  );
  const routine = routineKind(intent);
  const focusedAttribute = routineAttribute(intent);

  if (routine || focusedAttribute) {
    const target = focusedAttribute ?? routineTarget(routine as RoutineKind);
    const distribution = routineDistribution(target, attributes, giftMastery);
    const roll = randomInt(100);
    const outcome = selectOutcome(distribution, roll);
    const growth = routineGrowth(target, outcome, attributes, giftMastery);
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
      category: routineCategory(target),
      checkSource: "routine" satisfies CheckSource,
      calculationNote: routineNote(target),
      timeCost: "session",
      sceneDisposition: "end",
      narration: routineNarration(target, outcome),
      growth,
      gain: growth.find((entry) => entry.stat === target)?.amount ?? 0,
      fateDelta: 0,
      relationshipDelta: 0,
      socialImpact: "none",
      npcThought: null,
      npcMemory: null,
      npcIntroduced: false,
      location: currentLocation,
      focalNpc: null,
    });
  }

  if (!getQwenApiKey()) {
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
    exam: body.exam && typeof body.exam === "object" ? body.exam : null,
    story: body.story && typeof body.story === "object" ? body.story : null,
    location: currentLocation ?? "home",
    presentNpc: npcContext ? { profile: npcContext, introduced } : null,
    knownCharacters: known,
    recentContext,
    attemptedAction: intent,
  };

  const generated = await generatePlan(context, request.signal).catch(() => null);
  if (!generated) {
    return Response.json(
      { error: "AI is unavailable right now. Please try again." },
      { status: 502 },
    );
  }
  const plan = travelPlan(
    normalizePlan(generated, intent, gift),
    intent,
    currentLocation,
  );
  const travel = travelDestination(intent);
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
  const socialImpact = plan.resolutionMode === "blocked" ? "none" : plan.socialImpact;
  const travelDeparture = Boolean(
    travel && !isAtLocation(travel, currentLocation),
  );
  const sceneDisposition: SceneDisposition =
    plan.resolutionMode === "blocked"
      ? "continue"
      : travelDeparture
        ? "end"
        : rawSelected.sceneDisposition;

  const identities = known;
  const declaredNpc = plan.focalNpc
    ? attachNpcId(plan.focalNpc, npcContext ? [npcContext, ...identities] : identities)
    : null;
  let present: NpcProfile | null = declaredNpc;
  let presentIntroduced = false;
  if (present) {
    const presentName = present.name.toLocaleLowerCase();
    if (
      npcContext &&
      presentName === (npcName(npcContext)?.toLocaleLowerCase() ?? "")
    ) {
      presentIntroduced = introduced;
    } else if (
      known.some((character) => character.name.toLocaleLowerCase() === presentName)
    ) {
      presentIntroduced = true;
    }
  } else if (!travelDeparture && sceneDisposition === "continue" && npcContext) {
    const profile = parseNpcProfile(npcContext);
    present = profile;
    presentIntroduced = introduced;
  }
  const selected = resolveNpcVisibility(rawSelected, present, presentIntroduced);
  const resolvedLocation = travel
    ? travel.label
    : typeof plan.location === "string" && plan.location.trim()
      ? plan.location.trim().slice(0, 100)
      : currentLocation;
  const standardGain = growthGain(plan, outcome, skill);
  const growth = outcome
    ? compactGrowth([
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
    checkSource: "action" satisfies CheckSource,
    calculationNote:
      plan.resolutionMode === "check"
        ? "The outcome is based on the relevant skill, difficulty, risk, and established circumstances."
        : "The moment resolves without added risk or consequence.",
    timeCost: plan.resolutionMode === "blocked" ? "moment" : plan.timeCost,
    sceneDisposition,
    narration: selected.draft.narration,
    growth,
    gain: growth.find((entry) => entry.stat === plan.attribute)?.amount ?? 0,
    fateDelta: plan.resolutionMode === "blocked" ? 0 : fateDelta(plan),
    relationshipDelta: relationshipDelta(
      selected.draft.reaction,
      socialImpact,
      present,
    ),
    socialImpact,
    npcThought: socialImpact === "none" ? null : selected.draft.thought,
    npcMemory: socialImpact === "none" ? null : selected.draft.memory,
    npcIntroduced: selected.introduced,
    location: resolvedLocation,
    focalNpc: present,
  });
}