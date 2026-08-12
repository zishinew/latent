import {
  crushStyles,
  npcArchetypes,
  socialDifficulties,
  type CrushStyle,
  type NpcArchetype,
  type NpcProfile,
  type SocialDifficulty,
} from "../../characters";
import { sceneDirectorPrompt } from "../../game-prompts";
import { getQwenApiKey } from "../../qwen";

type EventTrigger = "ambient" | "exploration" | "social" | "continuation";
type BeatType =
  | "slice_of_life"
  | "relationship"
  | "school"
  | "training"
  | "exploration"
  | "mystery"
  | "danger"
  | "aftermath";
type BeatIntensity = "calm" | "low" | "medium" | "high";
type Tone = "opportunity" | "complication" | "danger" | "wonder";
type SceneGoalStatus = "setup" | "progress" | "resolved" | "abandoned";
type KnownCharacter = NpcProfile & {
  relationshipLevel?: number;
  memories?: string[];
};
type GeneratedNpc = Omit<NpcProfile, "id">;
type ThreadUpdate = {
  id: string | null;
  action: "none" | "seed" | "advance" | "resolve";
  summary: string | null;
};
type WorldEvent = {
  text: string;
  tone: Tone;
  beatType: BeatType;
  intensity: BeatIntensity;
  location: string;
  summary: string;
  sceneGoal: string;
  goalStatus: SceneGoalStatus;
  targetTurns: number;
  choices: string[];
  npc: NpcProfile | null;
  sceneStatus: "continue" | "end";
  threadUpdate: ThreadUpdate;
};
type GeneratedEvent = Omit<WorldEvent, "npc"> & {
  npc: GeneratedNpc | null;
};
type ActiveSceneContext = {
  kind: "ambient" | "exploration" | "social";
  location: string;
  npc: KnownCharacter | null;
  lastEvent: string;
  summary: string;
  sceneGoal: string;
  goalStatus: SceneGoalStatus;
  beatType: BeatType;
  intensity: BeatIntensity;
  targetTurns: number;
  turns: number;
};
type StoryBeat = {
  turn: number;
  type: BeatType;
  intensity: BeatIntensity;
  location: string;
  summary: string;
};
type StoryThread = {
  id: string;
  status: "seeded" | "developing" | "urgent" | "resolved";
  summary: string;
  lastAdvancedTurn: number;
};
type StoryContext = {
  turn: number;
  eventCount: number;
  chapterNumber: number;
  chapterBeat: number;
  chapterTitle: string;
  actionsSinceEvent: number;
  recentBeats: StoryBeat[];
  threads: StoryThread[];
};
type PacingDirective = {
  dramaticFunction:
    | "ordinary_life"
    | "relationship"
    | "personal_growth"
    | "foreshadow"
    | "incident"
    | "aftermath"
    | "exploration";
  preferredBeatTypes: BeatType[];
  maximumIntensity: BeatIntensity;
  preferKnownCharacter: boolean;
  threadInstruction: "none" | "seed" | "advance" | "resolve_or_reframe";
  targetTurns: { minimum: number; maximum: number };
  cooldowns: {
    beatTypes: BeatType[];
    locations: string[];
    hooks: string[];
  };
  chapterPurpose: string;
};

const beatTypes: BeatType[] = [
  "slice_of_life",
  "relationship",
  "school",
  "training",
  "exploration",
  "mystery",
  "danger",
  "aftermath",
];
const intensities: BeatIntensity[] = ["calm", "low", "medium", "high"];

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
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

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] ?? name;
}

function shortStrings(value: unknown, count: number, length = 120) {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.slice(0, length))
        .slice(0, count)
    : [];
}

function parseProfile(value: unknown): KnownCharacter | null {
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
    relationshipLevel:
      typeof item.relationshipLevel === "number"
        ? clamp(item.relationshipLevel, -100, 100)
        : undefined,
    memories: shortStrings(item.memories, 10, 180),
  };
}

function parseStory(value: unknown): StoryContext {
  const item = value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
  const recentBeats = Array.isArray(item.recentBeats)
    ? item.recentBeats
        .slice(-8)
        .map((beat): StoryBeat | null => {
          if (!beat || typeof beat !== "object") return null;
          const record = beat as Record<string, unknown>;
          if (
            !beatTypes.includes(record.type as BeatType) ||
            !intensities.includes(record.intensity as BeatIntensity) ||
            typeof record.location !== "string" ||
            typeof record.summary !== "string"
          ) return null;
          return {
            turn: typeof record.turn === "number" ? clamp(Math.floor(record.turn), 0, 100000) : 0,
            type: record.type as BeatType,
            intensity: record.intensity as BeatIntensity,
            location: record.location.slice(0, 100),
            summary: record.summary.slice(0, 240),
          };
        })
        .filter((beat): beat is StoryBeat => beat !== null)
    : [];
  const threads = Array.isArray(item.threads)
    ? item.threads
        .slice(-6)
        .map((thread): StoryThread | null => {
          if (!thread || typeof thread !== "object") return null;
          const record = thread as Record<string, unknown>;
          if (
            typeof record.id !== "string" ||
            typeof record.summary !== "string" ||
            !["seeded", "developing", "urgent", "resolved"].includes(String(record.status))
          ) return null;
          return {
            id: record.id.slice(0, 80),
            status: record.status as StoryThread["status"],
            summary: record.summary.slice(0, 300),
            lastAdvancedTurn:
              typeof record.lastAdvancedTurn === "number"
                ? clamp(Math.floor(record.lastAdvancedTurn), 0, 100000)
                : 0,
          };
        })
        .filter((thread): thread is StoryThread => thread !== null)
    : [];

  return {
    turn: typeof item.turn === "number" ? clamp(Math.floor(item.turn), 0, 100000) : 0,
    eventCount:
      typeof item.eventCount === "number"
        ? clamp(Math.floor(item.eventCount), 0, 10000)
        : 0,
    chapterNumber:
      typeof item.chapterNumber === "number"
        ? clamp(Math.floor(item.chapterNumber), 1, 1000)
        : 1,
    chapterBeat:
      typeof item.chapterBeat === "number"
        ? clamp(Math.floor(item.chapterBeat), 0, 5)
        : 0,
    chapterTitle:
      typeof item.chapterTitle === "string"
        ? item.chapterTitle.slice(0, 80)
        : "small beginnings",
    actionsSinceEvent:
      typeof item.actionsSinceEvent === "number"
        ? clamp(Math.floor(item.actionsSinceEvent), 0, 100)
        : 0,
    recentBeats,
    threads,
  };
}

function parseActiveScene(value: unknown, fallbackLocation: string): ActiveSceneContext | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const kind =
    item.kind === "exploration" || item.kind === "social"
      ? item.kind
      : "ambient";
  return {
    kind,
    location:
      typeof item.location === "string"
        ? item.location.slice(0, 100)
        : fallbackLocation || "home",
    npc: parseProfile(item.npc),
    lastEvent:
      typeof item.lastEvent === "string" ? item.lastEvent.slice(0, 800) : "",
    summary:
      typeof item.summary === "string" ? item.summary.slice(0, 300) : "",
    sceneGoal:
      typeof item.sceneGoal === "string" && item.sceneGoal.trim()
        ? item.sceneGoal.trim().slice(0, 240)
        : typeof item.summary === "string" && item.summary.trim()
          ? item.summary.trim().slice(0, 240)
          : "Let the current scene reach its central payoff.",
    goalStatus:
      item.goalStatus === "setup" ||
      item.goalStatus === "progress" ||
      item.goalStatus === "resolved" ||
      item.goalStatus === "abandoned"
        ? item.goalStatus
        : "progress",
    beatType: beatTypes.includes(item.beatType as BeatType)
      ? (item.beatType as BeatType)
      : "slice_of_life",
    intensity: intensities.includes(item.intensity as BeatIntensity)
      ? (item.intensity as BeatIntensity)
      : "low",
    targetTurns:
      typeof item.targetTurns === "number"
        ? clamp(Math.floor(item.targetTurns), 1, 5)
        : 2,
    turns:
      typeof item.turns === "number"
        ? clamp(Math.floor(item.turns), 0, 5)
        : 0,
  };
}

function pacingDirective(
  trigger: EventTrigger,
  story: StoryContext,
  activeScene: ActiveSceneContext | null,
): PacingDirective {
  const recent = story.recentBeats;
  const lastBeat = recent.at(-1);
  const recentHighIntensity = recent.slice(-2).some((beat) => beat.intensity === "high");
  const phase = story.eventCount % 6;
  let dramaticFunction: PacingDirective["dramaticFunction"] = [
    "ordinary_life",
    "relationship",
    "personal_growth",
    "foreshadow",
    "incident",
    "aftermath",
  ][phase] as PacingDirective["dramaticFunction"];

  if (trigger === "continuation" && activeScene) {
    dramaticFunction = activeScene.beatType === "danger"
      ? "incident"
      : activeScene.beatType === "exploration" || activeScene.beatType === "mystery"
        ? "exploration"
        : activeScene.beatType === "relationship"
          ? "relationship"
          : dramaticFunction;
  } else if (trigger === "social") {
    dramaticFunction = "relationship";
  } else if (trigger === "exploration") {
    dramaticFunction = "exploration";
  } else if (recentHighIntensity) {
    dramaticFunction = "aftermath";
  }

  const config: Record<
    PacingDirective["dramaticFunction"],
    Pick<PacingDirective, "preferredBeatTypes" | "maximumIntensity" | "targetTurns" | "threadInstruction">
  > = {
    ordinary_life: {
      preferredBeatTypes: ["slice_of_life", "school"],
      maximumIntensity: "low",
      targetTurns: { minimum: 1, maximum: 2 },
      threadInstruction: "none",
    },
    relationship: {
      preferredBeatTypes: ["relationship", "school", "slice_of_life"],
      maximumIntensity: "low",
      targetTurns: { minimum: 2, maximum: 3 },
      threadInstruction: story.threads.some((thread) => thread.status !== "resolved") ? "advance" : "seed",
    },
    personal_growth: {
      preferredBeatTypes: ["training", "school", "relationship"],
      maximumIntensity: "medium",
      targetTurns: { minimum: 1, maximum: 3 },
      threadInstruction: "advance",
    },
    foreshadow: {
      preferredBeatTypes: ["mystery", "slice_of_life", "school"],
      maximumIntensity: "medium",
      targetTurns: { minimum: 1, maximum: 3 },
      threadInstruction: story.threads.some((thread) => thread.status !== "resolved") ? "advance" : "seed",
    },
    incident: {
      preferredBeatTypes: ["danger", "mystery"],
      maximumIntensity: recentHighIntensity ? "medium" : "high",
      targetTurns: { minimum: 3, maximum: 5 },
      threadInstruction: "advance",
    },
    aftermath: {
      preferredBeatTypes: ["aftermath", "relationship", "slice_of_life"],
      maximumIntensity: "low",
      targetTurns: { minimum: 1, maximum: 2 },
      threadInstruction: "resolve_or_reframe",
    },
    exploration: {
      preferredBeatTypes: ["exploration", "mystery", "slice_of_life"],
      maximumIntensity: recentHighIntensity ? "low" : "medium",
      targetTurns: { minimum: 2, maximum: 4 },
      threadInstruction: story.threads.some((thread) => thread.status !== "resolved") ? "advance" : "seed",
    },
  };
  const chosen = config[dramaticFunction];

  return {
    dramaticFunction,
    ...chosen,
    preferKnownCharacter:
      dramaticFunction === "relationship" && story.eventCount > 0,
    cooldowns: {
      beatTypes: recent.slice(-2).map((beat) => beat.type),
      locations: lastBeat ? [lastBeat.location] : [],
      hooks: recent.slice(-4).map((beat) => beat.summary),
    },
    chapterPurpose:
      phase <= 1
        ? "Ground the player in ordinary childhood and establish one recurring relationship."
        : phase === 2
          ? "Make the player's limitations and room for growth concrete."
          : phase === 3
            ? "Seed an Anomaly-related question without immediately resolving it."
            : phase === 4
              ? "Pay off a seeded concern through a contained incident where choices matter and adults or heroes remain relevant."
              : "Let consequences breathe, strengthen relationships, and leave one thread for the future.",
  };
}

function isKnownCharacter(npc: { id?: string; name: string }, known: KnownCharacter[]) {
  return known.some(
    (character) =>
      character.id === npc.id ||
      character.name.toLocaleLowerCase() === npc.name.toLocaleLowerCase(),
  );
}

function containsIntroduction(text: string, name: string) {
  const rawGivenName = firstName(name);
  const escapedName = rawGivenName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const introduction = new RegExp(
    `(?:i(?:'|’)m|i am|my name is)\\s+${escapedName}\\b|introduc(?:e|es|ed|ing)[^.!?]{0,40}\\b${escapedName}\\b`,
    "i",
  ).exec(text);
  const firstUse = text.toLocaleLowerCase().indexOf(rawGivenName.toLocaleLowerCase());
  return Boolean(introduction && firstUse >= 0 && introduction.index <= firstUse);
}

function attachNpcId(event: GeneratedEvent, known: KnownCharacter[]): WorldEvent {
  if (!event.npc) return { ...event, npc: null };
  const existing = known.find(
    (character) =>
      character.name.toLocaleLowerCase() === event.npc?.name.toLocaleLowerCase(),
  );
  return {
    ...event,
    npc: existing ?? {
      ...event.npc,
      age: clamp(event.npc.age, 5, 100),
      id: npcId(event.npc.name),
    },
  };
}

function noThreadUpdate(): ThreadUpdate {
  return { id: null, action: "none", summary: null };
}

function closingFallback(activeScene: ActiveSceneContext): WorldEvent {
  const name = activeScene.npc ? firstName(activeScene.npc.name) : null;
  return {
    text: name
      ? `${name} lets the last words settle, then gives a small goodbye and heads off. The moment has reached its natural end, leaving you free to continue your day.`
      : `The last loose end at ${activeScene.location} settles. Nothing else demands your attention, and you are free to continue your day.`,
    tone: "opportunity",
    beatType: activeScene.beatType,
    intensity: "calm",
    location: activeScene.location,
    summary: `The scene at ${activeScene.location} ended naturally.`,
    sceneGoal: activeScene.sceneGoal,
    goalStatus:
      activeScene.goalStatus === "abandoned" ? "abandoned" : "resolved",
    targetTurns: activeScene.targetTurns,
    choices: [],
    npc: activeScene.npc,
    sceneStatus: "end",
    threadUpdate: noThreadUpdate(),
  };
}

function payoffFallback(activeScene: ActiveSceneContext): WorldEvent {
  const name = activeScene.npc ? firstName(activeScene.npc.name) : null;
  return {
    text: name
      ? `${name} follows the plan through to its decisive final step instead of abandoning it midway. Only after the promised activity is truly complete does the moment settle.`
      : `The central task at ${activeScene.location} reaches its decisive final step instead of being cut short. Only after it is truly resolved does the moment settle.`,
    tone: "opportunity",
    beatType: activeScene.beatType,
    intensity: "calm",
    location: activeScene.location,
    summary: `${activeScene.sceneGoal} The scene then ended naturally.`,
    sceneGoal: activeScene.sceneGoal,
    goalStatus: "resolved",
    targetTurns: activeScene.targetTurns,
    choices: [],
    npc: activeScene.npc,
    sceneStatus: "end",
    threadUpdate: noThreadUpdate(),
  };
}

function contextualFallback(
  trigger: EventTrigger,
  area: string,
  known: KnownCharacter[],
  activeScene: ActiveSceneContext | null,
  pacing: PacingDirective,
  story: StoryContext,
): WorldEvent {
  if (trigger === "continuation" && activeScene) {
    if (
      activeScene.turns + 1 >= activeScene.targetTurns &&
      (activeScene.goalStatus === "resolved" ||
        activeScene.goalStatus === "abandoned")
    ) {
      return closingFallback(activeScene);
    }
    if (activeScene.turns + 1 >= 5) {
      return payoffFallback(activeScene);
    }
    const name = activeScene.npc ? firstName(activeScene.npc.name) : null;
    const payoffDue = activeScene.turns + 1 >= activeScene.targetTurns;
    return {
      text: name
        ? payoffDue
          ? `${name} finishes the setup and turns back to you with everything ready. “Okay. This is the part we came for.” Their attention stays on the activity they promised instead of drifting to something new.`
          : `${name} pauses, then points out one detail neither of you has settled yet. Their attention stays on the immediate situation rather than drifting to something new.`
        : payoffDue
          ? `The setup at ${activeScene.location} is complete, bringing the scene's central task to its decisive moment instead of cutting it short.`
          : `One concrete detail at ${activeScene.location} remains unresolved, keeping the moment from ending just yet.`,
      tone: activeScene.intensity === "high" ? "danger" : "complication",
      beatType: activeScene.beatType,
      intensity: activeScene.intensity,
      location: activeScene.location,
      summary: activeScene.summary || `The scene at ${activeScene.location} continues.`,
      sceneGoal: activeScene.sceneGoal,
      goalStatus: "progress",
      targetTurns: payoffDue
        ? Math.min(5, activeScene.targetTurns + 1)
        : activeScene.targetTurns,
      choices: name
        ? [
            `Ask ${name} directly about the remaining problem`,
            "Offer one practical way to settle it",
            "Step back and see what happens next",
          ]
        : [
            "Look more closely at the unresolved detail",
            "Ask a nearby adult for help",
            "Keep your distance and wait",
          ],
      npc: activeScene.npc,
      sceneStatus: "continue",
      threadUpdate: noThreadUpdate(),
    };
  }

  if (trigger === "social" || pacing.dramaticFunction === "relationship") {
    const knownCandidate = pacing.preferKnownCharacter
      ? known.find((character) => (character.relationshipLevel ?? 0) > -40)
      : null;
    if (!knownCandidate) {
      throw new Error("AI-generated scenes require an AI response.");
    }
    const npc = knownCandidate;
    const knownNpc = isKnownCharacter(npc, known);
    const givenName = firstName(npc.name);
    return {
      text: knownNpc
        ? `At ${area}, ${givenName} spots you beside a half-finished chalk game and waves you over. “We’re missing one person,” they say, though the rules drawn on the ground contradict each other in three places.`
        : `At ${area}, a child your age is redrawing the rules of a chalk game while two others argue nearby. They notice you looking. “I’m ${givenName},” they say. “Do you understand what they’re even trying to play?”`,
      tone: "opportunity",
      beatType: "relationship",
      intensity: "low",
      location: area,
      summary: `${givenName} invited the player into a confused chalk game at ${area}.`,
      sceneGoal: `Join ${givenName}'s chalk game and see the shared activity through.`,
      goalStatus: "setup",
      targetTurns: 2,
      choices: [
        "Ask them to explain the game from the beginning",
        "Offer to fix the rules together",
        "Admit the rules make no sense and laugh about it",
      ],
      npc,
      sceneStatus: "continue",
      threadUpdate: noThreadUpdate(),
    };
  }

  if (trigger === "exploration" || pacing.dramaticFunction === "exploration") {
    return {
      text: `At ${area}, a row of small paper warning flags leads away from the public path. Most are sun-bleached, but the newest one carries today's date and a hero-agency inspection stamp. Beyond it, something taps twice against metal and goes quiet.`,
      tone: "wonder",
      beatType: "mystery",
      intensity: "medium",
      location: area,
      summary: `A freshly marked inspection trail at ${area} hinted at an unresolved disturbance.`,
      sceneGoal: "Investigate the inspection trail without crossing the safety boundary.",
      goalStatus: "setup",
      targetTurns: 3,
      choices: [
        "Read the warning flags without crossing them",
        "Find an adult and report the sound",
        "Circle around to look from a safer angle",
      ],
      npc: null,
      sceneStatus: "continue",
      threadUpdate: {
        id: `inspection-${story.chapterNumber}`,
        action: "seed",
        summary: `Fresh hero-agency warning flags appeared at ${area}.`,
      },
    };
  }

  if (pacing.dramaticFunction === "foreshadow") {
    return {
      text: "On the walk home, every public screen briefly loses its picture. A low warning tone hums for three seconds before the ordinary advertisements return. The adults nearby pretend not to stare at the eastern skyline.",
      tone: "wonder",
      beatType: "mystery",
      intensity: "low",
      location: "shopping street",
      summary: "A brief unexplained warning signal made nearby adults watch the eastern skyline.",
      sceneGoal: "Decide how to respond to the unexplained warning signal.",
      goalStatus: "setup",
      targetTurns: 1,
      choices: [
        "Ask a nearby adult what the warning tone meant",
        "Look toward the eastern skyline for anything unusual",
        "Remember the sound and continue home",
      ],
      npc: null,
      sceneStatus: "continue",
      threadUpdate: {
        id: `eastern-signal-${story.chapterNumber}`,
        action: "seed",
        summary: "An unexplained warning tone pointed attention toward the eastern skyline.",
      },
    };
  }

  if (pacing.dramaticFunction === "incident") {
    return {
      text: "A neighborhood evacuation speaker crackles to life as a thin distortion ripples across the end of the street. A licensed hero is already moving people back, but a delivery cart has rolled loose toward the shimmering boundary.",
      tone: "danger",
      beatType: "danger",
      intensity: "high",
      location: "neighborhood street",
      summary: "A small Anomaly boundary formed while a loose cart rolled toward it during evacuation.",
      sceneGoal: "Respond safely to the loose cart during the Anomaly evacuation.",
      goalStatus: "setup",
      targetTurns: 4,
      choices: [
        "Warn the hero about the rolling cart",
        "Move behind the marked evacuation line",
        "Try to stop the cart before it reaches the distortion",
      ],
      npc: null,
      sceneStatus: "continue",
      threadUpdate: {
        id: story.threads.find((thread) => thread.status !== "resolved")?.id ?? `first-anomaly-${story.chapterNumber}`,
        action: "advance",
        summary: "A contained neighborhood Anomaly forced an evacuation and drew a licensed hero.",
      },
    };
  }

  if (pacing.dramaticFunction === "aftermath") {
    return {
      text: "The next morning feels deliberately ordinary. Crossing guards wave children through, a repair crew paints over yesterday's warning marks, and the local news calls the disturbance ‘fully contained.’ One pale line in the pavement refuses to take the paint.",
      tone: "opportunity",
      beatType: "aftermath",
      intensity: "calm",
      location: "neighborhood street",
      summary: "The neighborhood returned to routine, though one mark from the disturbance remained.",
      sceneGoal: "Witness how the neighborhood is recovering from the disturbance.",
      goalStatus: "resolved",
      targetTurns: 1,
      choices: [],
      npc: null,
      sceneStatus: "end",
      threadUpdate: noThreadUpdate(),
    };
  }

  return {
    text: "At breakfast, the radio host announces that the community hero center is accepting children for a supervised safety workshop. Your school bag is still open on the floor, one worksheet unfinished beside it.",
    tone: "opportunity",
    beatType: "slice_of_life",
    intensity: "calm",
    location: "home",
    summary: "A hero-center safety workshop was announced during an otherwise ordinary morning.",
    sceneGoal: "Decide what to do about the workshop and unfinished schoolwork.",
    goalStatus: "setup",
    targetTurns: 1,
    choices: [
      "Ask your family about the safety workshop",
      "Finish the worksheet before thinking about heroes",
      "Write down the workshop details for later",
    ],
    npc: null,
    sceneStatus: "continue",
    threadUpdate: noThreadUpdate(),
  };
}

// Kept temporarily only to preserve the old response shape during a rolling deploy.
// The route no longer invokes this path: AI failures always return an error.
void contextualFallback;

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

async function generateEvent(context: Record<string, unknown>): Promise<GeneratedEvent | null> {
  const apiKey = getQwenApiKey();
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
        { role: "system", content: sceneDirectorPrompt },
        { role: "user", content: JSON.stringify(context) },
      ],
      text: {
        verbosity: "low",
        format: {
          type: "json_schema",
          name: "latent_scene_beat",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              text: { type: "string" },
              tone: {
                type: "string",
                enum: ["opportunity", "complication", "danger", "wonder"],
              },
              beatType: { type: "string", enum: beatTypes },
              intensity: { type: "string", enum: intensities },
              location: { type: "string" },
              summary: { type: "string" },
              sceneGoal: { type: "string" },
              goalStatus: {
                type: "string",
                enum: ["setup", "progress", "resolved", "abandoned"],
              },
              targetTurns: { type: "number" },
              choices: {
                type: "array",
                minItems: 0,
                maxItems: 3,
                items: { type: "string" },
              },
              npc: { anyOf: [npcSchema, { type: "null" }] },
              sceneStatus: { type: "string", enum: ["continue", "end"] },
              threadUpdate: {
                type: "object",
                additionalProperties: false,
                properties: {
                  id: { anyOf: [{ type: "string" }, { type: "null" }] },
                  action: {
                    type: "string",
                    enum: ["none", "seed", "advance", "resolve"],
                  },
                  summary: { anyOf: [{ type: "string" }, { type: "null" }] },
                },
                required: ["id", "action", "summary"],
              },
            },
            required: [
              "text",
              "tone",
              "beatType",
              "intensity",
              "location",
              "summary",
              "sceneGoal",
              "goalStatus",
              "targetTurns",
              "choices",
              "npc",
              "sceneStatus",
              "threadUpdate",
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
  return outputText ? (JSON.parse(outputText) as GeneratedEvent) : null;
}

function normalizeGeneratedEvent(
  event: GeneratedEvent,
  trigger: EventTrigger,
  known: KnownCharacter[],
  activeScene: ActiveSceneContext | null,
  pacing: PacingDirective,
  story: StoryContext,
): WorldEvent | null {
  if (event.sceneStatus === "continue" && event.choices.length !== 3) return null;
  if (event.sceneStatus === "end" && event.choices.length !== 0) return null;
  if (
    event.sceneStatus === "end" &&
    event.goalStatus !== "resolved" &&
    event.goalStatus !== "abandoned"
  ) return null;
  if (
    (trigger === "social" || trigger === "exploration") &&
    event.sceneStatus === "end"
  ) return null;
  if (
    event.npc &&
    !isKnownCharacter(event.npc, known) &&
    trigger !== "continuation" &&
    !containsIntroduction(event.text, event.npc.name)
  ) return null;
  if (trigger === "continuation" && activeScene) {
    const expectedNpc = activeScene.npc;
    if (
      (!expectedNpc && event.npc) ||
      (expectedNpc &&
        event.npc &&
        event.npc.name.toLocaleLowerCase() !== expectedNpc.name.toLocaleLowerCase())
    ) {
      return null;
    }
  }

  const withNpc = attachNpcId(event, known);
  const targetTurns = clamp(
    Math.round(event.targetTurns),
    pacing.targetTurns.minimum,
    pacing.targetTurns.maximum,
  );
  const threadUpdate = {
    id:
      event.threadUpdate.action === "none"
        ? null
        : (event.threadUpdate.id?.slice(0, 80) ?? `thread-${story.chapterNumber}-${story.eventCount + 1}`),
    action: event.threadUpdate.action,
    summary:
      event.threadUpdate.action === "none"
        ? null
        : (event.threadUpdate.summary?.slice(0, 300) ?? event.summary.slice(0, 300)),
  };

  return {
    ...withNpc,
    text: event.text.slice(0, 1200),
    location:
      trigger === "continuation" && activeScene
        ? activeScene.location
        : event.location.slice(0, 100),
    summary: event.summary.slice(0, 300),
    sceneGoal:
      trigger === "continuation" && activeScene
        ? activeScene.sceneGoal
        : event.sceneGoal.trim().slice(0, 240) || event.summary.slice(0, 240),
    goalStatus:
      trigger === "continuation" && activeScene?.goalStatus === "abandoned"
        ? "abandoned"
        : event.goalStatus,
    targetTurns:
      trigger === "continuation" && activeScene
        ? activeScene.turns + 1 >= activeScene.targetTurns &&
          event.goalStatus !== "resolved" &&
          event.goalStatus !== "abandoned"
          ? Math.min(5, activeScene.targetTurns + 1)
          : activeScene.targetTurns
        : targetTurns,
    npc:
      trigger === "continuation" && activeScene?.npc
        ? activeScene.npc
        : withNpc.npc,
    choices: event.choices.map((choice) => choice.slice(0, 180)),
    threadUpdate,
  };
}

export async function POST(request: Request) {
  if (!getQwenApiKey()) {
    return Response.json(
      { error: "AI is not configured. Add an API key before starting a scene." },
      { status: 503 },
    );
  }

  const body = (await request.json()) as Record<string, unknown>;
  const trigger: EventTrigger =
    body.trigger === "exploration" ||
    body.trigger === "social" ||
    body.trigger === "continuation"
      ? body.trigger
      : "ambient";
  const area =
    typeof body.triggerContext === "string"
      ? body.triggerContext.slice(0, 100)
      : "";
  const story = parseStory(body.story);
  const activeScene = parseActiveScene(body.activeScene, area);
  const known = Array.isArray(body.knownCharacters)
    ? body.knownCharacters
        .slice(0, 20)
        .map(parseProfile)
        .filter((profile): profile is KnownCharacter => profile !== null)
    : [];
  const pacing = pacingDirective(trigger, story, activeScene);

  const context = {
    player: {
      name: typeof body.playerName === "string" ? body.playerName.slice(0, 100) : "the player",
      gender: typeof body.gender === "string" ? body.gender.slice(0, 30) : "unspecified",
      age: typeof body.age === "number" ? clamp(body.age, 8, 100) : 8,
      gift: typeof body.gift === "string" ? body.gift.slice(0, 80) : "Unknown",
      giftRules:
        typeof body.giftDescription === "string"
          ? body.giftDescription.slice(0, 300)
          : "No additional mechanics supplied.",
      attributes: body.attributes && typeof body.attributes === "object" ? body.attributes : {},
      giftMastery:
        typeof body.giftMastery === "number"
          ? clamp(body.giftMastery, 0, 100)
          : 0,
      fate: typeof body.fate === "string" ? body.fate.slice(0, 40) : "undecided",
    },
    clock: body.clock && typeof body.clock === "object" ? body.clock : null,
    chapter: {
      number: story.chapterNumber,
      beat: story.chapterBeat,
      title: story.chapterTitle,
      purpose: pacing.chapterPurpose,
    },
    storyThreads: story.threads,
    recentBeatSummaries: story.recentBeats,
    pacingDirective: pacing,
    trigger,
    requestedArea: area || null,
    activeScene,
    scenePacing:
      trigger === "continuation" && activeScene
        ? {
            targetReached: activeScene.turns + 1 >= activeScene.targetTurns,
            hardCapReached: activeScene.turns + 1 >= 5,
            instruction:
              activeScene.goalStatus === "resolved" ||
              activeScene.goalStatus === "abandoned"
                ? "Close cleanly if the scene has no remaining consequence to show."
                : activeScene.turns + 1 >= activeScene.targetTurns
                  ? "Bring the central scene goal to its decisive payoff now. Do not end through departure, interruption, or summary before that payoff occurs."
                  : "Advance the central scene goal with one concrete beat.",
          }
        : null,
    latestResolvedOutcome:
      typeof body.sceneOutcome === "string"
        ? body.sceneOutcome.slice(0, 800)
        : null,
    focalNpcProfiles:
      activeScene?.npc
        ? [activeScene.npc]
        : pacing.preferKnownCharacter
          ? known.slice(0, 6)
          : known.slice(0, 3),
    recentActiveSceneContext:
      trigger === "continuation" && Array.isArray(body.recentContext)
        ? body.recentContext.slice(-8)
        : [],
  };

  const generated = await generateEvent(context).catch(() => null);
  if (!generated) {
    return Response.json(
      { error: "AI is unavailable right now. Please try again." },
      { status: 502 },
    );
  }
  const normalized = generated
    ? normalizeGeneratedEvent(
        generated,
        trigger,
        known,
        activeScene,
        pacing,
        story,
      )
    : null;

  if (!normalized) {
    return Response.json(
      { error: "AI returned an invalid scene. Please try again." },
      { status: 502 },
    );
  }

  return Response.json(normalized);
}
