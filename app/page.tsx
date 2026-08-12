"use client";

import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  canPerceiveThoughts,
  relationshipContactThreshold,
  relationshipImpactThreshold,
  type NpcProfile,
} from "./characters";
import { giftDescriptions, gifts } from "./gifts";

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
type CharacterSection = "name" | "gender" | "attributes" | "gift";
type GamePhase = "landing" | "creation" | "prologue" | "gameplay";
type ChatMessage = {
  id: number;
  role: "world" | "player" | "event" | "thought";
  text: string;
};
type Difficulty = "easy" | "standard" | "hard" | "extreme";
type Relationship = {
  npc: NpcProfile;
  level: number;
  interactions: number;
  hasContact: boolean;
  memories: string[];
  lastThought: string | null;
  metDay: number;
  isEstablished: boolean;
};
type PhoneMessage = {
  id: number;
  npcId: string;
  sender: "player" | "npc";
  text: string;
  read: boolean;
};
type ResolutionMode = "automatic" | "check" | "blocked" | "scene";
type OutcomeTier =
  | "major_setback"
  | "setback"
  | "mixed"
  | "success"
  | "breakthrough";
type OutcomeWeights = Record<OutcomeTier, number>;
type TimeCost = "moment" | "short" | "session" | "day";
type SceneDisposition = "continue" | "end";
type SocialImpact = "none" | "minor" | "meaningful";
type DayPeriod = "morning" | "afternoon" | "evening";
type CheckSource = "routine" | "event" | "action";
type StatGain = { stat: SkillName; amount: number };
type ActionResolution = {
  id: number;
  intent: string;
  mode: "check";
  difficulty: Difficulty;
  attribute: SkillName;
  outcome: OutcomeTier;
  distribution: OutcomeWeights;
  cleanChance: number;
  roll: number;
  timeCost: TimeCost;
  sceneDisposition: SceneDisposition;
  socialImpact: SocialImpact;
  checkSource: CheckSource;
  calculationNote: string;
  growth: StatGain[];
  gain: number;
  fateDelta: number;
  relationshipDelta: number;
  npcMemory: string | null;
  npcThought: string | null;
  npc: NpcProfile | null;
  narration: string;
};
type JudgeResult = Omit<ActionResolution, "id" | "intent" | "npc" | "mode"> & {
  mode: ResolutionMode;
  outcome: OutcomeTier | null;
  distribution: OutcomeWeights | null;
  cleanChance: number | null;
  roll: number | null;
  difficulty: Difficulty | null;
  sceneRequest: {
    trigger: "exploration" | "social";
    context: string;
  } | null;
};
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
type SceneGoalStatus = "setup" | "progress" | "resolved" | "abandoned";
type StoryThread = {
  id: string;
  status: "seeded" | "developing" | "urgent" | "resolved";
  summary: string;
  lastAdvancedTurn: number;
};
type StoryBeat = {
  turn: number;
  type: BeatType;
  intensity: BeatIntensity;
  location: string;
  summary: string;
};
type WorldEvent = {
  id: number;
  text: string;
  tone: "opportunity" | "complication" | "danger" | "wonder";
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
  threadUpdate: {
    id: string | null;
    action: "none" | "seed" | "advance" | "resolve";
    summary: string | null;
  };
};
type ActiveScene = {
  id: number;
  kind: "ambient" | "exploration" | "social";
  location: string;
  npc: NpcProfile | null;
  lastEvent: string;
  summary: string;
  sceneGoal: string;
  goalStatus: SceneGoalStatus;
  beatType: BeatType;
  intensity: BeatIntensity;
  targetTurns: number;
  turns: number;
};
type ActivityMenu = "explore" | "social" | null;
type AttributePreset = {
  id: string;
  name: string;
  values: Record<AttributeName, number>;
};

const sectionNames: CharacterSection[] = [
  "name",
  "gender",
  "attributes",
  "gift",
];

const visibleGiftOffsets = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5];

const attributeAngles = [-90, -30, 30, 90, 150, 210];
const radarCenter = 180;
const radarRadius = 112;
const totalAttributePoints = 20;
const maxAttributeValue = 20;
const maxGiftRerolls = 3;
const attributePresetStorageKey = "latent.attribute-presets.v1";
const characterIdentityStorageKey = "latent.character-identity.v1";
const genderOptions = ["woman", "man", "nonbinary"] as const;
const outcomeTierOrder: OutcomeTier[] = [
  "major_setback",
  "setback",
  "mixed",
  "success",
  "breakthrough",
];
const outcomeTierLabels: Record<OutcomeTier, string> = {
  major_setback: "major setback",
  setback: "setback",
  mixed: "mixed result",
  success: "success",
  breakthrough: "breakthrough",
};
const outcomeTierColors: Record<OutcomeTier, string> = {
  major_setback: "#2e2e2b",
  setback: "#666660",
  mixed: "#aaa9a2",
  success: "#d8d7d0",
  breakthrough: "#f3f2ed",
};
const presetActions = [
  { label: "train", intent: "I spend the afternoon training my body." },
  { label: "study", intent: "I study for tomorrow's classes." },
  { label: "practice gift", intent: "I carefully practice controlling my Gift." },
  { label: "make friends", intent: "I try to make friends with the neighborhood kids." },
  { label: "go exploring", intent: "I explore the streets around my neighborhood." },
] as const;
const explorationAreas = [
  "neighborhood park",
  "shopping street",
  "riverside path",
  "community hero center",
  "old transit yard",
] as const;
const socialAreas = [
  "school playground",
  "neighborhood park",
  "community gift class",
  "local arcade",
] as const;
const prologueLines = [
  "Seventy-two years ago, the first Gift awakened.",
  "Within a generation, the extraordinary became ordinary.",
  "But with the Gifts came the Anomalies—places where nature twisted into something hungry.",
  "From them came monsters, disasters, and threats no ordinary force could contain.",
  "Heroes rose because someone had to stand between humanity and the impossible.",
  "In time, heroism became a profession and rescue became an industry.",
  "The greatest among them were shaped inside fiercely competitive academies.",
  "You are eight years old. The academy gates are still years away, and your story begins at home.",
];

function capitalizeName(value: string) {
  return value.replace(
    /(^|[\s'’-])(\p{L})/gu,
    (_, separator: string, letter: string) =>
      `${separator}${letter.toLocaleUpperCase()}`,
  );
}

function formatInlineText(text: string) {
  return text
    .split(/(\*\*[^*\n]+?\*\*|\*[^*\n]+?\*)/g)
    .filter(Boolean)
    .map((part, index) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={`${index}-${part}`}>{part.slice(2, -2)}</strong>;
      }

      if (part.startsWith("*") && part.endsWith("*")) {
        return <em key={`${index}-${part}`}>{part.slice(1, -1)}</em>;
      }

      return part;
    });
}

function AnimatedInlineText({ text }: { text: string }) {
  const parts = text
    .split(/(\*\*[^*\n]+?\*\*|\*[^*\n]+?\*)/g)
    .filter(Boolean);
  const wordCount = parts.reduce((total, part) => {
    const content = part.startsWith("**")
      ? part.slice(2, -2)
      : part.startsWith("*")
        ? part.slice(1, -1)
        : part;
    return total + content.trim().split(/\s+/).filter(Boolean).length;
  }, 0);
  const stagger = Math.max(10, Math.min(28, 900 / Math.max(1, wordCount)));
  let wordIndex = 0;

  return parts.map((part, partIndex) => {
    const isStrong = part.startsWith("**") && part.endsWith("**");
    const isEmphasis = !isStrong && part.startsWith("*") && part.endsWith("*");
    const content = isStrong
      ? part.slice(2, -2)
      : isEmphasis
        ? part.slice(1, -1)
        : part;
    const words = content.split(/(\s+)/).map((token, tokenIndex) => {
      if (!token || /^\s+$/.test(token)) return token;
      const delay = wordIndex * stagger;
      wordIndex += 1;
      return (
        <span
          className="animated-word"
          key={`${partIndex}-${tokenIndex}-${token}`}
          style={{ "--word-delay": `${delay}ms` } as CSSProperties}
        >
          {token}
        </span>
      );
    });

    if (isStrong) return <strong key={`strong-${partIndex}`}>{words}</strong>;
    if (isEmphasis) return <em key={`em-${partIndex}`}>{words}</em>;
    return (
      <span className="animated-text-part" key={`text-${partIndex}`}>
        {words}
      </span>
    );
  });
}

function ChatSkeleton() {
  return (
    <div
      className="chat-message chat-message--world chat-message--loading"
      role="status"
      aria-label="The world is responding"
    >
      <span>world</span>
      <div className="chat-skeleton" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
    </div>
  );
}

function clampRelationship(value: number) {
  return Math.max(-100, Math.min(100, value));
}

function relationshipStatus(level: number) {
  if (level <= -45) return "enemy";
  if (level <= -15) return "hostile rival";
  if (level < 8) return "uneasy acquaintance";
  if (level < 25) return "acquaintance";
  if (level < 55) return "friend";
  if (level < 80) return "close friend";
  return "best friend";
}

function outcomeWheelGradient(distribution: OutcomeWeights) {
  let start = 0;
  const segments = outcomeTierOrder.flatMap((tier) => {
    const weight = distribution[tier];
    if (weight <= 0) return [];
    const end = start + weight;
    const segment = `${outcomeTierColors[tier]} ${start * 3.6}deg ${end * 3.6}deg`;
    start = end;
    return [segment];
  });

  return `conic-gradient(${segments.join(", ")})`;
}

function radarPoint(index: number, radius: number) {
  const angle = (attributeAngles[index] * Math.PI) / 180;
  const x = radarCenter + Math.cos(angle) * radius;
  const y = radarCenter + Math.sin(angle) * radius;

  return { x, y };
}

function radarPolygon(radius: number) {
  return attributeNames
    .map((_, index) => {
      const point = radarPoint(index, radius);
      return `${point.x},${point.y}`;
    })
    .join(" ");
}

function attributeRadarPolygon(values: number[], scale = maxAttributeValue) {
  return values
    .map((value, index) => {
      const radius =
        (Math.min(Math.max(value, 0), scale) / scale) *
        radarRadius;
      const point = radarPoint(index, radius);

      return `${point.x},${point.y}`;
    })
    .join(" ");
}

function AnimatedRadarArea({
  values,
  scale = maxAttributeValue,
}: {
  values: number[];
  scale?: number;
}) {
  const [displayedValues, setDisplayedValues] = useState(values);
  const displayedValuesRef = useRef(values);

  useEffect(() => {
    const startingValues = [...displayedValuesRef.current];
    const targetValues = [...values];
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (reduceMotion) {
      const animationFrame = window.requestAnimationFrame(() => {
        displayedValuesRef.current = targetValues;
        setDisplayedValues(targetValues);
      });
      return () => window.cancelAnimationFrame(animationFrame);
    }

    let animationFrame = 0;
    let startingTime: number | undefined;

    function animate(time: number) {
      startingTime ??= time;
      const progress = Math.min((time - startingTime) / 360, 1);
      const easedProgress = 1 - Math.pow(1 - progress, 3);
      const nextValues = startingValues.map(
        (value, index) =>
          value + (targetValues[index] - value) * easedProgress,
      );

      displayedValuesRef.current = nextValues;
      setDisplayedValues(nextValues);

      if (progress < 1) {
        animationFrame = window.requestAnimationFrame(animate);
      }
    }

    animationFrame = window.requestAnimationFrame(animate);

    return () => window.cancelAnimationFrame(animationFrame);
  }, [values]);

  return (
    <polygon
      className="radar-area"
      points={attributeRadarPolygon(displayedValues, scale)}
    />
  );
}

export default function Home() {
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [phase, setPhase] = useState<GamePhase>("landing");
  const [prologueIndex, setPrologueIndex] = useState(0);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [characterIdentityLoaded, setCharacterIdentityLoaded] = useState(false);
  const lastNameInputRef = useRef<HTMLInputElement>(null);
  const chatScrollRef = useRef<HTMLElement>(null);
  const eventRequestTokenRef = useRef(0);
  const eventControllerRef = useRef<AbortController | null>(null);
  const actionRequestTokenRef = useRef(0);
  const actionInFlightRef = useRef(false);
  const resolutionAppliedRef = useRef<number | null>(null);
  const phoneRequestTokenRef = useRef(0);
  const phoneControllerRef = useRef<AbortController | null>(null);
  const [gender, setGender] = useState("");
  const [giftIndex, setGiftIndex] = useState<number | null>(null);
  const [customGift, setCustomGift] = useState("");
  const [giftRevision, setGiftRevision] = useState(0);
  const [giftSpinSequence, setGiftSpinSequence] = useState<number[]>([]);
  const [isGiftSpinning, setIsGiftSpinning] = useState(false);
  const [giftRerollsUsed, setGiftRerollsUsed] = useState(0);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [customAction, setCustomAction] = useState("");
  const [day, setDay] = useState(1);
  const [dayPeriod, setDayPeriod] = useState<DayPeriod>("afternoon");
  const [storyTurn, setStoryTurn] = useState(0);
  const [eventCount, setEventCount] = useState(0);
  const [actionsSinceEvent, setActionsSinceEvent] = useState(0);
  const [nextEventAt, setNextEventAt] = useState(3);
  const [recentBeats, setRecentBeats] = useState<StoryBeat[]>([]);
  const [storyThreads, setStoryThreads] = useState<StoryThread[]>([]);
  const [isJudgingAction, setIsJudgingAction] = useState(false);
  const [actionResolution, setActionResolution] =
    useState<ActionResolution | null>(null);
  const [isResolutionRevealed, setIsResolutionRevealed] = useState(false);
  const [showSkills, setShowSkills] = useState(false);
  const [giftMastery, setGiftMastery] = useState(0);
  const [fateScore, setFateScore] = useState(0);
  const [worldEvent, setWorldEvent] = useState<WorldEvent | null>(null);
  const [activeScene, setActiveScene] = useState<ActiveScene | null>(null);
  const [isGeneratingEvent, setIsGeneratingEvent] = useState(false);
  const [activityMenu, setActivityMenu] = useState<ActivityMenu>(null);
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [showRelationships, setShowRelationships] = useState(false);
  const [showPhone, setShowPhone] = useState(false);
  const [activePhoneContact, setActivePhoneContact] = useState<string | null>(null);
  const [phoneMessages, setPhoneMessages] = useState<PhoneMessage[]>([]);
  const [phoneInput, setPhoneInput] = useState("");
  const [isGeneratingMessage, setIsGeneratingMessage] = useState(false);
  const [activeSection, setActiveSection] =
    useState<CharacterSection>("name");
  const [attributes, setAttributes] = useState<Record<AttributeName, number>>(
    () =>
      Object.fromEntries(attributeNames.map((attribute) => [attribute, 0])) as Record<
        AttributeName,
        number
      >,
  );
  const [attributePresets, setAttributePresets] = useState<AttributePreset[]>([]);
  const [attributePresetName, setAttributePresetName] = useState("");
  const [attributePresetsLoaded, setAttributePresetsLoaded] = useState(false);

  const requestAmbientWorldEvent = useEffectEvent(() => {
    void requestWorldEvent();
  });
  const requestAmbientNpcMessage = useEffectEvent((contact: Relationship) => {
    void generateNpcMessage(contact);
  });
  const revealResolutionAfterAnimation = useEffectEvent(() => {
    revealResolution();
  });

  useEffect(() => {
    if (!actionResolution || isResolutionRevealed) return;
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const timer = window.setTimeout(
      revealResolutionAfterAnimation,
      reduceMotion ? 0 : 2300,
    );
    return () => window.clearTimeout(timer);
  }, [actionResolution, isResolutionRevealed]);

  useEffect(() => {
    let storedFirstName: string | null = null;
    let storedLastName: string | null = null;
    let storedGender: string | null = null;

    try {
      const storedIdentity = JSON.parse(
        window.localStorage.getItem(characterIdentityStorageKey) ?? "null",
      ) as unknown;

      if (storedIdentity && typeof storedIdentity === "object") {
        const identity = storedIdentity as Record<string, unknown>;
        if (typeof identity.firstName === "string") {
          storedFirstName = capitalizeName(identity.firstName.slice(0, 50));
        }
        if (typeof identity.lastName === "string") {
          storedLastName = capitalizeName(identity.lastName.slice(0, 50));
        }
        if (
          typeof identity.gender === "string" &&
          genderOptions.includes(identity.gender as (typeof genderOptions)[number])
        ) {
          storedGender = identity.gender;
        }
      }
    } catch {
      // A damaged saved identity should never block character creation.
    }

    const animationFrame = window.requestAnimationFrame(() => {
      if (storedFirstName !== null) setFirstName(storedFirstName);
      if (storedLastName !== null) setLastName(storedLastName);
      if (storedGender !== null) setGender(storedGender);
      setCharacterIdentityLoaded(true);
    });

    return () => window.cancelAnimationFrame(animationFrame);
  }, []);

  useEffect(() => {
    if (!characterIdentityLoaded) return;

    try {
      window.localStorage.setItem(
        characterIdentityStorageKey,
        JSON.stringify({ firstName, lastName, gender }),
      );
    } catch {
      // The form still works normally when browser storage is unavailable.
    }
  }, [firstName, lastName, gender, characterIdentityLoaded]);

  useEffect(() => {
    let validPresets: AttributePreset[] = [];

    try {
      const storedPresets = JSON.parse(
        window.localStorage.getItem(attributePresetStorageKey) ?? "[]",
      ) as unknown;

      if (Array.isArray(storedPresets)) {
        validPresets = storedPresets
          .filter(
            (preset): preset is AttributePreset =>
              Boolean(
                preset &&
                  typeof preset === "object" &&
                  typeof (preset as AttributePreset).id === "string" &&
                  typeof (preset as AttributePreset).name === "string" &&
                  (preset as AttributePreset).values,
              ),
          )
          .filter((preset) => {
            const values = attributeNames.map(
              (attribute) => preset.values[attribute],
            );

            return (
              values.every(
                (value) =>
                  Number.isFinite(value) &&
                  value >= 0 &&
                  value <= maxAttributeValue,
              ) &&
              values.reduce((total, value) => total + value, 0) ===
                totalAttributePoints
            );
          })
          .slice(-8);
      }
    } catch {
      validPresets = [];
    }

    const animationFrame = window.requestAnimationFrame(() => {
      setAttributePresets(validPresets);
      setAttributePresetsLoaded(true);
    });

    return () => window.cancelAnimationFrame(animationFrame);
  }, []);

  useEffect(() => {
    if (!attributePresetsLoaded) {
      return;
    }

    try {
      window.localStorage.setItem(
        attributePresetStorageKey,
        JSON.stringify(attributePresets),
      );
    } catch {
      // Attribute presets remain available for this session if storage is blocked.
    }
  }, [attributePresets, attributePresetsLoaded]);

  useEffect(() => {
    if (
      phase !== "gameplay" ||
      isJudgingAction ||
      actionResolution ||
      worldEvent ||
      activeScene ||
      activityMenu ||
      showSkills ||
      showPhone ||
      showRelationships ||
      isGeneratingEvent
    ) {
      return;
    }

    const delay =
      actionsSinceEvent >= nextEventAt
        ? 1400
        : 60000 + Math.random() * 60000;
    const timer = window.setTimeout(() => {
      requestAmbientWorldEvent();
    }, delay);

    return () => window.clearTimeout(timer);
  }, [
    phase,
    isJudgingAction,
    actionResolution,
    worldEvent,
    activeScene,
    activityMenu,
    showSkills,
    showPhone,
    showRelationships,
    isGeneratingEvent,
    actionsSinceEvent,
    nextEventAt,
    chatMessages.length,
  ]);

  useEffect(() => {
    if (phase !== "gameplay") return;

    const behavior: ScrollBehavior = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches
      ? "auto"
      : "smooth";
    const scrollToLatest = (scrollBehavior: ScrollBehavior) => {
      const transcript = chatScrollRef.current;
      if (!transcript) return;
      transcript.scrollTo({
        top: transcript.scrollHeight,
        behavior: scrollBehavior,
      });
    };
    const animationFrame = window.requestAnimationFrame(() =>
      scrollToLatest(behavior),
    );
    const settleTimer = window.setTimeout(() => scrollToLatest("auto"), 520);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.clearTimeout(settleTimer);
    };
  }, [
    phase,
    chatMessages,
    isJudgingAction,
    isGeneratingEvent,
    worldEvent,
    activeScene,
    activityMenu,
  ]);

  useEffect(() => {
    if (
      phase !== "gameplay" ||
      showPhone ||
      showRelationships ||
      actionResolution ||
      isJudgingAction ||
      activeScene ||
      worldEvent ||
      isGeneratingEvent ||
      activityMenu ||
      isGeneratingMessage
    ) {
      return;
    }

    const contacts = relationships.filter(
      (relationship) => relationship.hasContact,
    );
    if (!contacts.length) return;

    const timer = window.setTimeout(() => {
      const contact = contacts[Math.floor(Math.random() * contacts.length)];
      requestAmbientNpcMessage(contact);
    }, 45000 + Math.random() * 45000);

    return () => window.clearTimeout(timer);
  }, [
    phase,
    showPhone,
    showRelationships,
    actionResolution,
    isJudgingAction,
    activeScene,
    worldEvent,
    isGeneratingEvent,
    activityMenu,
    isGeneratingMessage,
    relationships,
    phoneMessages.length,
  ]);

  function attributeValue(attribute: AttributeName) {
    const value = attributes[attribute];
    return Number.isFinite(value) ? value : 0;
  }

  function currentNpcAge(relationship: Relationship) {
    return (
      relationship.npc.age +
      Math.floor(Math.max(0, day - relationship.metDay) / 365)
    );
  }

  const investedPoints = attributeNames.reduce(
    (total, attribute) => total + attributeValue(attribute),
    0,
  );
  const remainingPoints = totalAttributePoints - investedPoints;
  const activeSectionIndex = sectionNames.indexOf(activeSection);
  const selectedGift = giftIndex === null ? null : gifts[giftIndex];
  const chosenGiftName =
    selectedGift === "Custom" && customGift.trim()
      ? customGift.trim()
      : selectedGift;
  const perceivesThoughts = canPerceiveThoughts(chosenGiftName);
  const isCharacterComplete = Boolean(
    firstName.trim() &&
      lastName.trim() &&
      gender &&
      remainingPoints === 0 &&
      selectedGift &&
      (selectedGift !== "Custom" || customGift.trim()),
  );
  const characterAge = 8 + Math.floor((day - 1) / 365);
  const chapterNumber = Math.floor(eventCount / 6) + 1;
  const chapterBeat = eventCount % 6;
  const chapterTitle =
    chapterNumber === 1
      ? "small beginnings"
      : chapterNumber === 2
        ? "fault lines"
        : chapterNumber === 3
          ? "first consequences"
          : `chapter ${chapterNumber}`;
  const chosenGiftDescription =
    selectedGift === "Custom"
      ? `A unique Gift called ${customGift.trim() || "Custom"}. Its capabilities must be discovered gradually and cannot exceed established progression.`
      : selectedGift
        ? giftDescriptions[selectedGift]
        : "The Gift has not been selected.";
  const fateLabel =
    fateScore >= 25
      ? "heroic"
      : fateScore >= 8
        ? "aspiring hero"
        : fateScore <= -25
          ? "villainous"
          : fateScore <= -8
            ? "drifting darker"
            : "undecided";
  const skillScale = Math.max(
    20,
    Math.ceil(
      Math.max(...attributeNames.map((attribute) => attributeValue(attribute))) /
        10,
    ) * 10,
  );

  function navigateCharacterCreation(direction: -1 | 1) {
    const nextSection = sectionNames[activeSectionIndex + direction];

    if (nextSection) {
      setActiveSection(nextSection);
    }
  }

  function beginCharacterCreation() {
    setIsTransitioning(true);

    window.setTimeout(() => {
      setPhase("creation");
      setIsTransitioning(false);
    }, 600);
  }

  function finishCharacterCreation() {
    if (!isCharacterComplete || isTransitioning) {
      return;
    }

    setIsTransitioning(true);

    window.setTimeout(() => {
      setPhase("prologue");
      setIsTransitioning(false);
    }, 700);
  }

  function advancePrologue() {
    if (prologueIndex < prologueLines.length - 1) {
      setPrologueIndex((index) => index + 1);
      return;
    }

    setPhase("gameplay");
  }

  function advanceClock(timeCost: TimeCost) {
    if (timeCost === "moment" || timeCost === "short") return;

    if (timeCost === "day") {
      setDay((current) => current + 1);
      setDayPeriod("morning");
      return;
    }

    setDayPeriod((current) => {
      if (current === "morning") return "afternoon";
      if (current === "afternoon") return "evening";
      setDay((currentDay) => currentDay + 1);
      return "morning";
    });
  }

  function applyResolutionEffects(
    result: JudgeResult | ActionResolution,
    npc: NpcProfile | null,
    wasInScene: boolean,
  ) {
    advanceClock(result.timeCost);
    setStoryTurn((current) => current + 1);
    if (!wasInScene) {
      setActionsSinceEvent((current) => current + 1);
    }

    if (result.fateDelta !== 0) {
      setFateScore((current) =>
        Math.max(-100, Math.min(100, current + result.fateDelta)),
      );
    }

    if (npc && result.socialImpact !== "none") {
      setRelationships((current) => {
        const existing = current.find(
          (relationship) => relationship.npc.id === npc.id,
        );
        const nextLevel = clampRelationship(
          (existing?.level ?? 0) + result.relationshipDelta,
        );
        const nextInteractions = (existing?.interactions ?? 0) + 1;
        const contactThreshold = relationshipContactThreshold(
          npc.socialDifficulty,
        );
        const impactThreshold = relationshipImpactThreshold(
          npc.socialDifficulty,
        );
        const updated: Relationship = {
          npc: existing?.npc ?? npc,
          level: nextLevel,
          interactions: nextInteractions,
          hasContact:
            existing?.hasContact === true ||
            nextLevel >= contactThreshold.level ||
            nextInteractions >= contactThreshold.interactions,
          memories: result.npcMemory
            ? [...(existing?.memories ?? []), result.npcMemory].slice(-10)
            : (existing?.memories ?? []),
          lastThought: result.npcThought ?? existing?.lastThought ?? null,
          metDay: existing?.metDay ?? day,
          isEstablished:
            existing?.isEstablished === true ||
            nextInteractions >= impactThreshold ||
            Math.abs(nextLevel) >= 7,
        };

        return existing
          ? current.map((relationship) =>
              relationship.npc.id === npc.id ? updated : relationship,
            )
          : [...current, updated];
      });
    }

    const giftGain = result.growth.find(
      (entry) => entry.stat === "Gift Mastery",
    )?.amount;
    if (giftGain) {
      setGiftMastery((current) => Math.min(100, current + giftGain));
    }
    const attributeGrowth = result.growth.filter(
      (entry): entry is { stat: AttributeName; amount: number } =>
        entry.stat !== "Gift Mastery",
    );
    if (attributeGrowth.length) {
      setAttributes((current) => {
        const next = { ...current };
        for (const entry of attributeGrowth) {
          next[entry.stat] = Math.min(100, next[entry.stat] + entry.amount);
        }
        return next;
      });
    }
  }

  function appendResolutionNarration(
    narration: string,
    npc: NpcProfile | null,
    npcThought: string | null,
  ) {
    setChatMessages((current) => [
      ...current,
      { id: Date.now() + 1, role: "world", text: narration },
      ...(perceivesThoughts && npc && npcThought
        ? [
            {
              id: Date.now() + 2,
              role: "thought" as const,
              text: `${npc.name.split(/\s+/)[0]}: “${npcThought}”`,
            },
          ]
        : []),
    ]);
  }

  function finishSceneBeat(
    scene: ActiveScene | null,
    disposition: SceneDisposition,
    narration: string,
  ) {
    if (!scene) return;

    if (disposition === "end") {
      eventRequestTokenRef.current += 1;
      eventControllerRef.current?.abort();
      eventControllerRef.current = null;
      setWorldEvent(null);
      setActiveScene(null);
      return;
    }

    void requestWorldEvent({
      trigger: "continuation",
      context: scene.location,
      outcome: narration,
    });
  }

  async function requestWorldEvent(options?: {
    trigger?: "ambient" | "exploration" | "social" | "continuation";
    context?: string;
    outcome?: string;
  }) {
    const trigger = options?.trigger ?? "ambient";
    const isContinuation = trigger === "continuation";
    if (
      phase !== "gameplay" ||
      eventControllerRef.current !== null ||
      isGeneratingEvent ||
      isJudgingAction ||
      (!isContinuation && (actionResolution || worldEvent || activeScene)) ||
      (isContinuation && !activeScene)
    ) {
      return;
    }

    const requestToken = ++eventRequestTokenRef.current;
    setIsGeneratingEvent(true);
    const controller = new AbortController();
    eventControllerRef.current = controller;
    phoneControllerRef.current?.abort();
    const timeout = window.setTimeout(() => controller.abort(), 12000);

    try {
      const response = await fetch("/api/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          playerName: `${firstName} ${lastName}`.trim(),
          gender,
          age: characterAge,
          gift: chosenGiftName,
          giftDescription: chosenGiftDescription,
          attributes,
          giftMastery,
          fate: fateLabel,
          clock: { day, period: dayPeriod },
          story: {
            turn: storyTurn,
            eventCount,
            chapterNumber,
            chapterBeat,
            chapterTitle,
            actionsSinceEvent,
            recentBeats,
            threads: storyThreads,
          },
          trigger,
          triggerContext: options?.context ?? activeScene?.location ?? "",
          activeScene: activeScene
            ? {
                kind: activeScene.kind,
                location: activeScene.location,
                npc: activeScene.npc,
                lastEvent: activeScene.lastEvent,
                summary: activeScene.summary,
                sceneGoal: activeScene.sceneGoal,
                goalStatus: activeScene.goalStatus,
                beatType: activeScene.beatType,
                intensity: activeScene.intensity,
                targetTurns: activeScene.targetTurns,
                turns: activeScene.turns,
              }
            : null,
          sceneOutcome: options?.outcome ?? null,
          knownCharacters: relationships.map((relationship) => ({
            ...relationship.npc,
            age: currentNpcAge(relationship),
            relationshipLevel: relationship.level,
            memories: relationship.memories,
          })),
          recentContext: isContinuation
            ? chatMessages.slice(-8).map((message) => ({
                role: message.role,
                text: message.text,
              }))
            : [],
        }),
      });

      if (!response.ok) {
        throw new Error("The next scene beat could not be generated.");
      }

      const generatedEvent = (await response.json()) as Omit<WorldEvent, "id">;
      if (requestToken !== eventRequestTokenRef.current) return;
      const nextEvent = {
        ...generatedEvent,
        npc:
          isContinuation && activeScene?.npc
            ? activeScene.npc
            : generatedEvent.npc,
        id: Date.now(),
      };
      setActivityMenu(null);
      setStoryTurn((current) => current + 1);
      setRecentBeats((current) => [
        ...current,
        {
          turn: storyTurn + 1,
          type: nextEvent.beatType,
          intensity: nextEvent.intensity,
          location: nextEvent.location,
          summary: nextEvent.summary,
        },
      ].slice(-8));
      if (!isContinuation) {
        setEventCount((current) => current + 1);
        setActionsSinceEvent(0);
        setNextEventAt(2 + Math.floor(Math.random() * 3));
      }
      if (
        nextEvent.threadUpdate.action !== "none" &&
        nextEvent.threadUpdate.id &&
        nextEvent.threadUpdate.summary
      ) {
        const threadId = nextEvent.threadUpdate.id;
        const threadSummary = nextEvent.threadUpdate.summary;
        setStoryThreads((current) => {
          const existing = current.find(
            (thread) => thread.id === threadId,
          );
          const status =
            nextEvent.threadUpdate.action === "resolve"
              ? "resolved"
              : nextEvent.threadUpdate.action === "advance"
                ? "developing"
                : "seeded";
          const updated: StoryThread = {
            id: threadId,
            status,
            summary: threadSummary,
            lastAdvancedTurn: storyTurn + 1,
          };
          return (existing
            ? current.map((thread) =>
                thread.id === updated.id ? updated : thread,
              )
            : [...current, updated]
          ).slice(-6);
        });
      }
      setChatMessages((current) => [
        ...current,
        { id: nextEvent.id, role: "event", text: nextEvent.text },
      ]);
      if (nextEvent.sceneStatus === "end") {
        setWorldEvent(null);
        setActiveScene(null);
        return;
      }
      setWorldEvent(nextEvent);
      setActiveScene((current) => ({
        id: current?.id ?? nextEvent.id,
        kind:
          current?.kind ??
          (trigger === "exploration" || trigger === "social"
            ? trigger
            : "ambient"),
        location:
          current?.location ?? nextEvent.location,
        npc: nextEvent.npc ?? current?.npc ?? null,
        lastEvent: nextEvent.text,
        summary: nextEvent.summary,
        sceneGoal: current?.sceneGoal ?? nextEvent.sceneGoal,
        goalStatus: nextEvent.goalStatus,
        beatType: nextEvent.beatType,
        intensity: nextEvent.intensity,
        targetTurns: current
          ? Math.max(current.targetTurns, nextEvent.targetTurns)
          : nextEvent.targetTurns,
        turns: current ? current.turns + 1 : 0,
      }));
    } catch {
      if (isContinuation && requestToken === eventRequestTokenRef.current) {
        setWorldEvent(null);
        setActiveScene(null);
      }
    } finally {
      window.clearTimeout(timeout);
      if (requestToken === eventRequestTokenRef.current) {
        eventControllerRef.current = null;
        setIsGeneratingEvent(false);
      }
    }
  }

  async function beginAction(intent: string) {
    const trimmedIntent = intent.trim();
    const eventContext = worldEvent?.text ?? activeScene?.lastEvent ?? null;
    const eventNpc = worldEvent?.npc ?? activeScene?.npc ?? null;
    const sceneAtStart = activeScene;

    if (
      !trimmedIntent ||
      actionInFlightRef.current ||
      isJudgingAction ||
      isGeneratingEvent ||
      actionResolution !== null
    ) {
      return;
    }

    actionInFlightRef.current = true;
    phoneControllerRef.current?.abort();
    const requestToken = ++actionRequestTokenRef.current;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 22000);
    setIsJudgingAction(true);
    setChatMessages((current) => [
      ...current,
      { id: Date.now(), role: "player", text: trimmedIntent },
    ]);

    try {
      const response = await fetch("/api/judge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          intent: trimmedIntent,
          playerName: `${firstName} ${lastName}`.trim(),
          gender,
          age: characterAge,
          gift: chosenGiftName,
          giftDescription: chosenGiftDescription,
          attributes,
          giftMastery,
          fateScore,
          clock: { day, period: dayPeriod },
          story: {
            turn: storyTurn,
            chapterNumber,
            chapterBeat,
            chapterTitle,
            recentBeats,
            threads: storyThreads,
          },
          eventContext,
          eventMeta: sceneAtStart
            ? {
                beatType: sceneAtStart.beatType,
                intensity: sceneAtStart.intensity,
              }
            : worldEvent
              ? {
                  beatType: worldEvent.beatType,
                  intensity: worldEvent.intensity,
                }
              : null,
          sceneState: sceneAtStart
            ? {
                sceneGoal: sceneAtStart.sceneGoal,
                goalStatus: sceneAtStart.goalStatus,
                turns: sceneAtStart.turns,
                targetTurns: sceneAtStart.targetTurns,
              }
            : null,
          npcContext: eventNpc,
          recentContext: eventContext ? chatMessages.slice(-8) : [],
        }),
      });

      if (!response.ok) {
        throw new Error("The world could not judge that action.");
      }

      const result = (await response.json()) as JudgeResult;
      if (requestToken !== actionRequestTokenRef.current) return;

      if (result.mode === "scene" && result.sceneRequest && !sceneAtStart) {
        const sceneRequest = result.sceneRequest;
        void requestWorldEvent({
          trigger: sceneRequest.trigger,
          context: sceneRequest.context,
        });
        return;
      }

      if (result.mode === "blocked") {
        appendResolutionNarration(result.narration, null, null);
        return;
      }

      if (result.mode === "automatic") {
        if (eventContext) setWorldEvent(null);
        applyResolutionEffects(result, eventNpc, Boolean(sceneAtStart));
        appendResolutionNarration(
          result.narration,
          eventNpc,
          result.npcThought,
        );
        finishSceneBeat(
          sceneAtStart,
          result.sceneDisposition,
          result.narration,
        );
        return;
      }

      if (
        result.mode !== "check" ||
        !result.outcome ||
        !result.distribution ||
        result.roll === null ||
        result.cleanChance === null ||
        !result.difficulty
      ) {
        throw new Error("The action result was incomplete.");
      }

      setActionResolution({
        ...result,
        mode: "check",
        difficulty: result.difficulty,
        outcome: result.outcome,
        distribution: result.distribution,
        cleanChance: result.cleanChance,
        roll: result.roll,
        id: Date.now(),
        intent: trimmedIntent,
        npc: eventNpc,
      });
      setIsResolutionRevealed(false);
      if (eventContext) setWorldEvent(null);
    } catch {
      if (requestToken === actionRequestTokenRef.current) {
        setChatMessages((current) => [
          ...current,
          {
            id: Date.now() + 1,
            role: "world",
            text: "The moment pauses before the attempt can resolve. Nothing changes; you can try again.",
          },
        ]);
      }
    } finally {
      window.clearTimeout(timeout);
      if (requestToken === actionRequestTokenRef.current) {
        actionInFlightRef.current = false;
        setIsJudgingAction(false);
      }
    }
  }

  function submitCustomAction(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const intent = customAction.trim();

    if (
      !intent ||
      isJudgingAction ||
      isGeneratingEvent ||
      actionResolution !== null
    ) {
      return;
    }

    setCustomAction("");
    setActivityMenu(null);
    void beginAction(intent);
  }

  function revealResolution() {
    if (
      !actionResolution ||
      isResolutionRevealed ||
      resolutionAppliedRef.current === actionResolution.id
    ) {
      return;
    }

    resolutionAppliedRef.current = actionResolution.id;
    setIsResolutionRevealed(true);
    applyResolutionEffects(
      actionResolution,
      actionResolution.npc,
      Boolean(activeScene),
    );
  }

  function closeResolution() {
    if (
      !actionResolution ||
      !isResolutionRevealed ||
      resolutionAppliedRef.current !== actionResolution.id
    ) {
      return;
    }

    const resolvedAction = actionResolution;
    resolutionAppliedRef.current = null;
    const sceneAtResolution = activeScene;
    appendResolutionNarration(
      resolvedAction.narration,
      resolvedAction.npc,
      resolvedAction.npcThought,
    );
    setActionResolution(null);
    setIsResolutionRevealed(false);
    finishSceneBeat(
      sceneAtResolution,
      resolvedAction.sceneDisposition,
      resolvedAction.narration,
    );
  }

  function leaveActiveScene() {
    if (!activeScene || isJudgingAction || actionResolution) return;
    eventRequestTokenRef.current += 1;
    eventControllerRef.current?.abort();
    eventControllerRef.current = null;
    setIsGeneratingEvent(false);
    setWorldEvent(null);
    setActiveScene(null);
    setActivityMenu(null);
    advanceClock("short");
    setStoryTurn((current) => current + 1);
    setChatMessages((current) => [
      ...current,
      {
        id: Date.now(),
        role: "world",
        text: activeScene.npc
          ? `You end the conversation with ${activeScene.npc.name.split(/\s+/)[0]} and leave ${activeScene.location}.`
          : `You leave ${activeScene.location} behind and return to your day.`,
      },
    ]);
  }

  async function generateNpcMessage(
    relationship: Relationship,
    replyTo = "",
  ) {
    if (phoneControllerRef.current || isGeneratingMessage) return;
    const requestToken = ++phoneRequestTokenRef.current;
    const controller = new AbortController();
    phoneControllerRef.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 12000);
    setIsGeneratingMessage(true);

    try {
      const recentMessages = phoneMessages
        .filter((message) => message.npcId === relationship.npc.id)
        .slice(-10);
      const response = await fetch("/api/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          npc: { ...relationship.npc, age: currentNpcAge(relationship) },
          protagonistAge: characterAge,
          level: relationship.level,
          memories: relationship.memories,
          replyTo,
          recentMessages,
        }),
      });
      if (!response.ok) return;
      const result = (await response.json()) as { text: string };
      if (requestToken !== phoneRequestTokenRef.current) return;
      const id = Date.now();
      setPhoneMessages((current) => [
        ...current,
        {
          id,
          npcId: relationship.npc.id,
          sender: "npc",
          text: result.text,
          read: showPhone && activePhoneContact === relationship.npc.id,
        },
      ]);
      if (!showPhone) {
        setChatMessages((current) => [
          ...current,
          {
            id: id + 1,
            role: "world",
            text: `Your phone buzzes. ${relationship.npc.name} sent you a message.`,
          },
        ]);
      }
    } catch {
      // A missed message can be retried without changing the story state.
    } finally {
      window.clearTimeout(timeout);
      if (requestToken === phoneRequestTokenRef.current) {
        phoneControllerRef.current = null;
        setIsGeneratingMessage(false);
      }
    }
  }

  function openPhone(contactId?: string) {
    const nextContact =
      contactId ??
      activePhoneContact ??
      relationships.find((relationship) => relationship.hasContact)?.npc.id ??
      null;
    setActivePhoneContact(nextContact);
    setShowRelationships(false);
    setShowPhone(true);
    if (nextContact) {
      setPhoneMessages((current) =>
        current.map((message) =>
          message.npcId === nextContact ? { ...message, read: true } : message,
        ),
      );
    }
  }

  function selectPhoneContact(contactId: string) {
    setActivePhoneContact(contactId);
    setPhoneMessages((current) =>
      current.map((message) =>
        message.npcId === contactId ? { ...message, read: true } : message,
      ),
    );
  }

  function sendPhoneMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = phoneInput.trim();
    const relationship = relationships.find(
      (item) => item.npc.id === activePhoneContact,
    );
    if (!text || !relationship || isGeneratingMessage) return;

    setPhoneMessages((current) => [
      ...current,
      {
        id: Date.now(),
        npcId: relationship.npc.id,
        sender: "player",
        text,
        read: true,
      },
    ]);
    setPhoneInput("");
    window.setTimeout(() => void generateNpcMessage(relationship, text), 500);
  }

  function completeNameStep() {
    const completedFirstName = capitalizeName(firstName.trim());
    const completedLastName = capitalizeName(lastName.trim());

    if (!completedFirstName || !completedLastName) {
      return;
    }

    setFirstName(completedFirstName);
    setLastName(completedLastName);
    setActiveSection("gender");
  }

  function adjustAttribute(attribute: AttributeName, amount: number) {
    if (
      (amount > 0 &&
        (remainingPoints === 0 ||
          attributeValue(attribute) >= maxAttributeValue)) ||
      (amount < 0 && attributeValue(attribute) === 0)
    ) {
      return;
    }

    setAttributes((current) => ({
      ...current,
      [attribute]: (Number.isFinite(current[attribute]) ? current[attribute] : 0) + amount,
    }));
  }

  function saveAttributePreset(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = attributePresetName.trim();

    if (!name || remainingPoints !== 0) {
      return;
    }

    setAttributePresets((current) => {
      const matchingPreset = current.find(
        (preset) => preset.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
      );
      const nextPreset: AttributePreset = {
        id: matchingPreset?.id ?? `${Date.now()}-${Math.random()}`,
        name,
        values: { ...attributes },
      };

      return [
        ...current.filter((preset) => preset.id !== matchingPreset?.id),
        nextPreset,
      ].slice(-8);
    });
    setAttributePresetName("");
  }

  function loadAttributePreset(presetId: string) {
    const preset = attributePresets.find((item) => item.id === presetId);

    if (preset) {
      setAttributes({ ...preset.values });
    }
  }

  function wrappedGiftIndex(index: number) {
    return (index + gifts.length) % gifts.length;
  }

  function spinGiftWheel() {
    if (isGiftSpinning || (giftIndex !== null && giftRerollsUsed >= maxGiftRerolls)) {
      return;
    }

    if (giftIndex !== null) {
      setGiftRerollsUsed((used) => used + 1);
    }

    let nextIndex = Math.floor(Math.random() * gifts.length);

    while (nextIndex === giftIndex) {
      nextIndex = Math.floor(Math.random() * gifts.length);
    }

    const firstIndex =
      giftIndex ?? Math.floor(Math.random() * gifts.length);
    const sequence = [
      firstIndex,
      ...Array.from({ length: 34 }, () =>
        Math.floor(Math.random() * gifts.length),
      ),
      nextIndex,
      ...Array.from({ length: 5 }, () =>
        Math.floor(Math.random() * gifts.length),
      ),
    ];

    setGiftSpinSequence(sequence);
    setIsGiftSpinning(true);
    setGiftIndex(nextIndex);
    setGiftRevision((revision) => revision + 1);
  }

  function renderCharacterEditor() {
    if (activeSection === "name") {
      return (
        <form
          className="character-editor-content"
          onSubmit={(event) => {
            event.preventDefault();
            completeNameStep();
          }}
        >
          <p className="editor-label">name</p>
          <div className="name-fields">
            <label className="name-field" htmlFor="character-first-name">
              <span>first name</span>
              <input
                className="editor-input"
                id="character-first-name"
                type="text"
                value={firstName}
                onChange={(event) =>
                  setFirstName(capitalizeName(event.target.value))
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    lastNameInputRef.current?.focus();
                  }
                }}
                autoComplete="given-name"
                required
              />
            </label>
            <label className="name-field" htmlFor="character-last-name">
              <span>last name</span>
              <input
                ref={lastNameInputRef}
                className="editor-input"
                id="character-last-name"
                type="text"
                value={lastName}
                onChange={(event) =>
                  setLastName(capitalizeName(event.target.value))
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    completeNameStep();
                  }
                }}
                autoComplete="family-name"
                required
              />
            </label>
          </div>
        </form>
      );
    }

    if (activeSection === "gender") {
      return (
        <div className="character-editor-content">
          <p className="editor-label">gender</p>
          <div className="choice-list">
            {genderOptions.map((option) => (
              <button
                className={`choice-button ${gender === option ? "choice-button--selected" : ""}`}
                key={option}
                type="button"
                onClick={() => {
                  setGender(option);
                  setActiveSection("attributes");
                }}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      );
    }

    if (activeSection === "gift") {
      const displayedGiftIndex = giftIndex ?? 0;
      const wheelItems = giftSpinSequence.length
        ? giftSpinSequence.map((index) => gifts[index])
        : visibleGiftOffsets.map((offset) =>
            giftIndex === null && offset === 0
              ? "Unknown"
              : gifts[wrappedGiftIndex(displayedGiftIndex + offset)],
          );

      return (
        <div className="gift-editor">
          <div className="gift-heading">
            <p className="editor-label">gift</p>
          </div>
          <div
            className="gift-wheel"
            role="listbox"
            aria-label="Random gift result"
          >
            <div
              className={`gift-wheel-list ${isGiftSpinning ? "gift-wheel-list--spinning" : giftSpinSequence.length ? "gift-wheel-list--settled" : "gift-wheel-list--resting"}`}
              key={giftRevision}
              style={
                {
                  "--spin-distance": `${Math.max(wheelItems.length - 6, 0) * 3.5}rem`,
                } as React.CSSProperties
              }
              onAnimationEnd={() => {
                if (isGiftSpinning) {
                  setIsGiftSpinning(false);
                }
              }}
            >
              {wheelItems.map((option, index) => {
                const isSelected = giftSpinSequence.length
                  ? index === wheelItems.length - 6
                  : index === Math.floor(wheelItems.length / 2);

                return (
                  <span
                    className={`gift-option ${option === "Custom" ? "gift-option--custom" : ""} ${isGiftSpinning ? "gift-option--rolling" : ""} ${isSelected ? "gift-option--selected" : ""}`}
                    key={`${option}-${index}`}
                    role="option"
                    aria-selected={isSelected}
                  >
                    {option.toLowerCase()}
                  </span>
                );
              })}
            </div>
          </div>
          <button
            className="gift-spin-button"
            type="button"
            onClick={spinGiftWheel}
            disabled={
              isGiftSpinning ||
              (selectedGift !== null && giftRerollsUsed >= maxGiftRerolls)
            }
          >
            {isGiftSpinning
              ? "spinning"
              : selectedGift === null
                ? "receive gift"
                : giftRerollsUsed >= maxGiftRerolls
                  ? "no rerolls left"
                  : `reroll · ${maxGiftRerolls - giftRerollsUsed} left`}
          </button>
          {selectedGift === "Custom" && !isGiftSpinning && (
            <form
              className="custom-gift-form"
              onSubmit={(event) => {
                event.preventDefault();
                setCustomGift(customGift.trim());
              }}
            >
              <label htmlFor="custom-gift">name your gift</label>
              <input
                id="custom-gift"
                className="editor-input"
                type="text"
                value={customGift}
                onChange={(event) => setCustomGift(event.target.value)}
                placeholder="describe your power"
                autoComplete="off"
                required
              />
            </form>
          )}
          <p className="gift-selection" aria-live="polite">
            {isGiftSpinning
              ? "fate is turning"
              : selectedGift === null
              ? "your gift is unknown"
              : selectedGift === "Custom" && customGift.trim()
              ? customGift.trim().toLowerCase()
              : selectedGift.toLowerCase()}
          </p>
          {selectedGift !== null && !isGiftSpinning && (
            <aside
              className="gift-description-panel"
              key={selectedGift}
              aria-live="polite"
            >
              <span>gift received</span>
              <h2 className={selectedGift === "Custom" ? "gift-description-name--custom" : ""}>
                {selectedGift === "Custom" && customGift.trim()
                  ? customGift.trim().toLowerCase()
                  : selectedGift.toLowerCase()}
              </h2>
              <p>{giftDescriptions[selectedGift]}</p>
            </aside>
          )}
        </div>
      );
    }

    return (
      <div className="attribute-editor">
        <div className="attribute-editor-heading">
          <p className="editor-label">attributes</p>
          <span>{remainingPoints} points left</span>
        </div>
        <div className="radar-chart">
          <svg
            className="radar-graphic"
            viewBox="0 0 360 360"
            role="img"
            aria-label="Six-sided attribute chart"
          >
            {[0.25, 0.5, 0.75, 1].map((scale) => (
              <polygon
                className={scale === 1 ? "radar-ring radar-ring--outer" : "radar-ring"}
                key={scale}
                points={radarPolygon(radarRadius * scale)}
              />
            ))}
            {attributeNames.map((attribute, index) => {
              const point = radarPoint(index, radarRadius);
              return (
                <line
                  className="radar-spoke"
                  key={attribute}
                  x1={radarCenter}
                  y1={radarCenter}
                  x2={point.x}
                  y2={point.y}
                />
              );
            })}
            <AnimatedRadarArea
              values={attributeNames.map((attribute) =>
                attributeValue(attribute),
              )}
            />
          </svg>
          {attributeNames.map((attribute, index) => (
            <span
              className={`radar-label radar-label--${index}`}
              key={attribute}
            >
              {attribute.toLowerCase()}
            </span>
          ))}
        </div>
        <div className="attribute-controls-list">
          {attributeNames.map((attribute) => (
            <div className="attribute-row" key={attribute}>
              <span>{attribute.toLowerCase()}</span>
              <div className="attribute-controls">
                <button
                  type="button"
                  onClick={() => adjustAttribute(attribute, -1)}
                  disabled={attributeValue(attribute) === 0}
                  aria-label={`Decrease ${attribute}`}
                >
                  −
                </button>
                <output>{attributeValue(attribute)}</output>
                <button
                  type="button"
                  onClick={() => adjustAttribute(attribute, 1)}
                  disabled={
                    remainingPoints === 0 ||
                    attributeValue(attribute) >= maxAttributeValue
                  }
                  aria-label={`Increase ${attribute}`}
                >
                  +
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="attribute-presets">
          <form onSubmit={saveAttributePreset}>
            <label htmlFor="attribute-preset-name">presets</label>
            <input
              id="attribute-preset-name"
              type="text"
              value={attributePresetName}
              onChange={(event) => setAttributePresetName(event.target.value)}
              placeholder={remainingPoints === 0 ? "preset name" : "spend all points first"}
              maxLength={24}
              disabled={remainingPoints !== 0}
              autoComplete="off"
            />
            <button
              type="submit"
              disabled={!attributePresetName.trim() || remainingPoints !== 0}
            >
              save
            </button>
          </form>
          <select
            value=""
            onChange={(event) => loadAttributePreset(event.target.value)}
            disabled={attributePresets.length === 0}
            aria-label="Load an attribute preset"
          >
            <option value="" disabled>
              {attributePresets.length ? "load preset" : "no saved presets"}
            </option>
            {attributePresets.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.name}
              </option>
            ))}
          </select>
          <small>saved on this device · up to 8</small>
        </div>
      </div>
    );
  }

  if (phase === "gameplay") {
    const landingAngle = actionResolution
      ? (actionResolution.roll - 0.5) * 3.6
      : 0;
    const wheelRotation = 1440 + (360 - landingAngle);
    const unreadMessages = phoneMessages.filter((message) => !message.read).length;
    const phoneContacts = relationships.filter((relationship) => relationship.hasContact);
    const establishedRelationships = relationships.filter(
      (relationship) => relationship.isEstablished,
    );
    const activeRelationship = relationships.find(
      (relationship) => relationship.npc.id === activePhoneContact,
    );
    const activeThread = phoneMessages.filter(
      (message) => message.npcId === activePhoneContact,
    );

    return (
      <main className="gameplay-screen">
        <header className="gameplay-header">
          <h1 className="game-title">latent.</h1>
          <div className="gameplay-identity">
            <div className="gameplay-context">
              <small>{chapterTitle}</small>
              <p>
                age {characterAge}
                <span aria-hidden="true"> · </span>
                day {day}, {dayPeriod}
                <span aria-hidden="true"> · </span>
                {firstName.toLowerCase()} {lastName.toLowerCase()}
                <span aria-hidden="true"> · </span>
                {chosenGiftName?.toLowerCase()}
                <span aria-hidden="true"> · </span>
                {fateLabel}
              </p>
            </div>
            <div className="gameplay-tools">
              <button type="button" onClick={() => setShowRelationships(true)}>
                relationships{establishedRelationships.length ? ` · ${establishedRelationships.length}` : ""}
              </button>
              <button type="button" onClick={() => openPhone()}>
                phone{unreadMessages ? ` · ${unreadMessages}` : ""}
              </button>
              <button type="button" onClick={() => setShowSkills(true)}>
                view skills
              </button>
            </div>
          </div>
        </header>
        <section className="gameplay-chat" ref={chatScrollRef} aria-live="polite">
          <div className="chat-transcript">
            <div className="chat-message chat-message--world">
              <span>world</span>
              <p>You are eight years old.</p>
            </div>
            <div className="chat-message chat-message--world">
              <span>world</span>
              <p>
                Morning light reaches across your bedroom floor. Outside, children
                practice their Gifts between apartment towers while a licensed hero
                patrols overhead. The academy entrance exams are still years away.
                Today is yours to shape.
              </p>
            </div>
            {chatMessages.map((message) => (
              <div
                className={`chat-message chat-message--${message.role}`}
                key={message.id}
              >
                <span>
                  {message.role === "player"
                    ? "you"
                    : message.role === "event"
                      ? "event"
                      : message.role === "thought"
                        ? "surface thought"
                      : "world"}
                </span>
                <p>
                  {message.role === "player" ? (
                    formatInlineText(message.text)
                  ) : (
                    <AnimatedInlineText text={message.text} />
                  )}
                </p>
              </div>
            ))}
            {(isJudgingAction || isGeneratingEvent) && <ChatSkeleton />}
          </div>
        </section>
        <aside className={`action-dock ${activeScene ? "action-dock--scene" : ""}`} aria-label="Suggested actions">
          <span>
            {isJudgingAction || isGeneratingEvent
              ? "the world is responding"
              : worldEvent
              ? "the moment demands an answer"
              : activeScene
                ? "the scene is still unfolding"
              : activityMenu === "explore"
                ? "where do you want to explore?"
                : activityMenu === "social"
                  ? "where do you want to meet people?"
                  : "choose an action"}
          </span>
          <div>
            {(worldEvent
              ? worldEvent.choices.map((choice) => ({ label: choice, intent: choice }))
              : activeScene
                ? []
              : activityMenu === "explore"
                ? explorationAreas.map((area) => ({ label: area, intent: area }))
                : activityMenu === "social"
                  ? socialAreas.map((area) => ({ label: area, intent: area }))
                  : presetActions
            ).map((action) => (
                <button
                  type="button"
                  key={action.label}
                  onClick={() => {
                    if (!worldEvent && activityMenu === "explore") {
                      void requestWorldEvent({ trigger: "exploration", context: action.intent });
                    } else if (!worldEvent && activityMenu === "social") {
                      void requestWorldEvent({ trigger: "social", context: action.intent });
                    } else if (!worldEvent && action.label === "go exploring") {
                      setActivityMenu("explore");
                    } else if (!worldEvent && action.label === "make friends") {
                      setActivityMenu("social");
                    } else {
                      void beginAction(action.intent);
                    }
                  }}
                  disabled={isJudgingAction || isGeneratingEvent || actionResolution !== null}
                >
                  {formatInlineText(action.label)}
                </button>
              ))}
            {activeScene && (
              <button
                className="action-leave"
                type="button"
                onClick={leaveActiveScene}
                disabled={isJudgingAction || actionResolution !== null}
              >
                leave
              </button>
            )}
            {activityMenu && !worldEvent && (
              <button type="button" onClick={() => setActivityMenu(null)}>
                back
              </button>
            )}
          </div>
          <p>
            {isJudgingAction || isGeneratingEvent
              ? "writing the next moment..."
              : worldEvent
              ? "your response may change more than this moment."
              : activeScene
                  ? "finish this interaction or leave before beginning something else."
                : "ordinary choices resolve directly. uncertain attempts are tested."}
          </p>
          <form className="chat-composer" onSubmit={submitCustomAction}>
            <label htmlFor="custom-action">
              {worldEvent || activeScene
                ? "or respond in your own words"
                : "or choose your own action"}
            </label>
            <div>
              <input
                id="custom-action"
                value={customAction}
                onChange={(event) => setCustomAction(event.target.value)}
                placeholder={
                  worldEvent || activeScene
                    ? "what do you do or say?"
                    : "what do you want to attempt?"
                }
                autoComplete="off"
                disabled={
                  isJudgingAction ||
                  isGeneratingEvent ||
                  actionResolution !== null
                }
              />
              <button
                type="submit"
                disabled={
                  !customAction.trim() ||
                  isJudgingAction ||
                  isGeneratingEvent ||
                  actionResolution !== null
                }
              >
                act
              </button>
            </div>
          </form>
        </aside>
        {actionResolution && (
          <div className="resolution-overlay" role="dialog" aria-modal="true" aria-label="Action outcome">
            <section className="resolution-card">
              <header>
                <span>{actionResolution.difficulty}</span>
                <p>
                  {actionResolution.checkSource === "routine"
                    ? "routine · "
                    : actionResolution.checkSource === "event"
                      ? "experience · "
                      : ""}
                  {actionResolution.attribute.toLowerCase()} check
                </p>
              </header>
              <div className="outcome-wheel-layout">
                <div className="outcome-wheel-wrap">
                  <i aria-hidden="true" />
                  <div
                    className="outcome-wheel"
                    key={actionResolution.id}
                    onAnimationEnd={revealResolution}
                    style={
                      {
                        "--wheel-rotation": `${wheelRotation}deg`,
                        background: outcomeWheelGradient(actionResolution.distribution),
                      } as React.CSSProperties
                    }
                    role="img"
                    aria-label="A five-tier outcome wheel"
                  />
                  <div className="outcome-wheel-center" aria-hidden="true">
                    <span>d100</span>
                  </div>
                </div>
                <div className="outcome-tier-legend" aria-label="Outcome chances">
                  {outcomeTierOrder
                    .filter((tier) => actionResolution.distribution[tier] > 0)
                    .map((tier) => (
                      <span key={tier}>
                        <i
                          aria-hidden="true"
                          style={{ background: outcomeTierColors[tier] }}
                        />
                        {outcomeTierLabels[tier]}
                        <small>{actionResolution.distribution[tier]}%</small>
                      </span>
                    ))}
                </div>
              </div>
              <div className={`resolution-result ${isResolutionRevealed ? "resolution-result--visible" : ""}`}>
                <strong>{outcomeTierLabels[actionResolution.outcome]}</strong>
                {actionResolution.growth.map((entry) => (
                  <span key={entry.stat}>
                    +{entry.amount.toFixed(2)} {entry.stat.toLowerCase()}
                  </span>
                ))}
                {actionResolution.fateDelta !== 0 && (
                  <span className="resolution-fate-shift">
                    fate {actionResolution.fateDelta > 0 ? "leans heroic" : "leans darker"}
                  </span>
                )}
                {perceivesThoughts && actionResolution.npc && actionResolution.relationshipDelta !== 0 && (
                  <span className="resolution-relationship-shift">
                    affinity {actionResolution.relationshipDelta > 0 ? "+" : ""}{actionResolution.relationshipDelta}
                  </span>
                )}
              </div>
              <p className="resolution-note">
                {actionResolution.calculationNote}
              </p>
              <button
                className="resolution-continue"
                type="button"
                onClick={closeResolution}
                disabled={!isResolutionRevealed}
              >
                continue
              </button>
            </section>
          </div>
        )}
        {showSkills && (
          <div className="skills-overlay" role="dialog" aria-modal="true" aria-label="Character skills">
            <section className="skills-panel">
              <header>
                <div>
                  <span>age {characterAge}</span>
                  <h2>skills</h2>
                </div>
                <button type="button" onClick={() => setShowSkills(false)} aria-label="Close skills">
                  close
                </button>
              </header>
              <div className="skills-radar">
                <svg viewBox="0 0 360 360" role="img" aria-label="Current skill graph">
                  {[0.25, 0.5, 0.75, 1].map((scale) => (
                    <polygon
                      className={scale === 1 ? "radar-ring radar-ring--outer" : "radar-ring"}
                      key={scale}
                      points={radarPolygon(radarRadius * scale)}
                    />
                  ))}
                  {attributeNames.map((attribute, index) => {
                    const point = radarPoint(index, radarRadius);
                    return (
                      <line
                        className="radar-spoke"
                        key={attribute}
                        x1={radarCenter}
                        y1={radarCenter}
                        x2={point.x}
                        y2={point.y}
                      />
                    );
                  })}
                  <AnimatedRadarArea
                    values={attributeNames.map((attribute) => attributeValue(attribute))}
                    scale={skillScale}
                  />
                </svg>
                {attributeNames.map((attribute, index) => (
                  <span className={`radar-label radar-label--${index}`} key={attribute}>
                    {attribute.toLowerCase()}
                  </span>
                ))}
              </div>
              <div className="skills-values">
                {attributeNames.map((attribute) => (
                  <p key={attribute}>
                    <span>{attribute.toLowerCase()}</span>
                    <strong>{attributeValue(attribute).toFixed(2)}</strong>
                  </p>
                ))}
              </div>
              <div className="gift-mastery-stat">
                <div>
                  <span>gift mastery</span>
                  <strong>{giftMastery.toFixed(2)}</strong>
                </div>
                <div className="gift-mastery-track" aria-label={`Gift mastery ${giftMastery.toFixed(2)} out of 100`}>
                  <i style={{ width: `${giftMastery}%` }} />
                </div>
                <p>control and practical understanding of {chosenGiftName?.toLowerCase()}</p>
              </div>
              <div className="fate-stat">
                <div>
                  <span>fate</span>
                  <strong>{fateLabel}</strong>
                </div>
                <div className="fate-track" aria-label={`Fate ${fateScore}, ${fateLabel}`}>
                  <i style={{ left: `${(fateScore + 100) / 2}%` }} />
                </div>
                <p>villain <span>undecided</span> hero</p>
              </div>
              <small>graph scale · {skillScale}</small>
            </section>
          </div>
        )}
        {showRelationships && (
          <div className="relationships-overlay" role="dialog" aria-modal="true" aria-label="Relationships">
            <section className="relationships-panel">
              <header className="panel-header">
                <div>
                  <span>people remember what you do</span>
                  <h2>relationships</h2>
                </div>
                <button type="button" onClick={() => setShowRelationships(false)}>close</button>
              </header>
              {establishedRelationships.length ? (
                <div className="relationship-list">
                  {establishedRelationships
                    .slice()
                    .sort((a, b) => a.npc.name.localeCompare(b.npc.name))
                    .map((relationship) => (
                      <article className="relationship-card" key={relationship.npc.id}>
                        <div>
                          <h3>{relationship.npc.name}</h3>
                          <p>
                            age {currentNpcAge(relationship)} · {relationship.npc.traits.slice(0, Math.min(relationship.interactions, 2)).join(" · ") || "still unfamiliar"}
                          </p>
                        </div>
                        {perceivesThoughts && (
                          <div className="relationship-insight">
                            <div className="relationship-meter" aria-label={`Affinity ${relationship.level}`}>
                              <i style={{ width: `${(relationship.level + 100) / 2}%` }} />
                            </div>
                            <span>{relationshipStatus(relationship.level)} · affinity {relationship.level}</span>
                            {relationship.lastThought && (
                              <q>{formatInlineText(relationship.lastThought)}</q>
                            )}
                          </div>
                        )}
                        <footer>
                          <span>{relationship.interactions} {relationship.interactions === 1 ? "interaction" : "interactions"}</span>
                          {relationship.hasContact ? (
                            <button type="button" onClick={() => openPhone(relationship.npc.id)}>
                              message
                            </button>
                          ) : (
                            <small>get to know them to exchange contacts</small>
                          )}
                        </footer>
                      </article>
                    ))}
                </div>
              ) : (
                <p className="panel-empty">
                  You have not spent enough time with anyone yet. Meeting someone is only the beginning; how you treat them decides what follows.
                </p>
              )}
            </section>
          </div>
        )}
        {showPhone && (
          <div className="phone-overlay" role="dialog" aria-modal="true" aria-label="Phone">
            <section className="phone-panel">
              <header className="panel-header">
                <div>
                  <span>{characterAge < 13 ? "family phone" : "your phone"}</span>
                  <h2>messages</h2>
                </div>
                <button type="button" onClick={() => setShowPhone(false)}>close</button>
              </header>
              {phoneContacts.length ? (
                <div className="phone-content">
                  <nav className="phone-contacts" aria-label="Contacts">
                    {phoneContacts.map((relationship) => {
                      const unread = phoneMessages.filter(
                        (message) => message.npcId === relationship.npc.id && !message.read,
                      ).length;
                      return (
                        <button
                          className={activePhoneContact === relationship.npc.id ? "active" : ""}
                          type="button"
                          key={relationship.npc.id}
                          onClick={() => selectPhoneContact(relationship.npc.id)}
                        >
                          <span>{relationship.npc.name}</span>
                          <small>{unread ? `${unread} new` : perceivesThoughts ? relationshipStatus(relationship.level) : "contact"}</small>
                        </button>
                      );
                    })}
                  </nav>
                  <section className="phone-thread">
                    {activeRelationship ? (
                      <>
                        <header>
                          <strong>{activeRelationship.npc.name}</strong>
                          <span>
                            {activeRelationship.npc.traits[0] ?? "familiar"}
                            {perceivesThoughts ? ` · ${relationshipStatus(activeRelationship.level)}` : ""}
                          </span>
                        </header>
                        <div className="phone-messages" aria-live="polite">
                          {activeThread.length ? activeThread.map((message) => (
                            <p className={`phone-message phone-message--${message.sender}`} key={message.id}>
                              {formatInlineText(message.text)}
                            </p>
                          )) : (
                            <p className="phone-thread-empty">No messages yet. You can say hello, or wait to see if they reach out first.</p>
                          )}
                          {isGeneratingMessage && <p className="phone-typing">typing...</p>}
                        </div>
                        <form className="phone-composer" onSubmit={sendPhoneMessage}>
                          <input
                            value={phoneInput}
                            onChange={(event) => setPhoneInput(event.target.value)}
                            placeholder="write a message"
                            aria-label={`Message ${activeRelationship.npc.name}`}
                            disabled={isGeneratingMessage}
                          />
                          <button type="submit" disabled={!phoneInput.trim() || isGeneratingMessage}>send</button>
                        </form>
                      </>
                    ) : null}
                  </section>
                </div>
              ) : (
                <p className="panel-empty">
                  No contacts yet. Spend time with someone before you can reach them when you are apart.
                </p>
              )}
            </section>
          </div>
        )}
      </main>
    );
  }

  if (phase === "prologue") {
    return (
      <main className="prologue-screen">
        <h1 className="game-title prologue-title">latent.</h1>
        <section className="prologue-dialogue" aria-live="polite">
          <p className="prologue-line" key={prologueIndex}>
            {prologueLines[prologueIndex]}
          </p>
          <button type="button" onClick={advancePrologue}>
            {prologueIndex === prologueLines.length - 1
              ? "enter the world"
              : "continue"}
          </button>
        </section>
      </main>
    );
  }

  if (phase === "creation") {
    return (
      <main className="character-creation-screen">
        <aside className="character-sidebar" aria-label="Character creation sections">
          {sectionNames.map((section, index) => (
            <button
              className={`sidebar-button ${activeSection === section ? "sidebar-button--selected" : ""}`}
              key={section}
              type="button"
              onClick={() => setActiveSection(section)}
              style={{ "--step-delay": `${140 + index * 65}ms` } as React.CSSProperties}
            >
              <span className="sidebar-index">0{index + 1}</span>
              <span>{section}</span>
            </button>
          ))}
        </aside>
        <h1 className="game-title character-creation-title text-2xl font-normal leading-none">
          character creation
        </h1>
        <section
          className="character-editor"
          key={activeSection}
          aria-live="polite"
        >
          {renderCharacterEditor()}
        </section>
        <nav className="character-navigation" aria-label="Character creation navigation">
          <button
            type="button"
            onClick={() => navigateCharacterCreation(-1)}
            disabled={activeSectionIndex === 0}
          >
            <span aria-hidden="true">←</span> previous
          </button>
          <button
            type="button"
            onClick={() => {
              if (activeSectionIndex === sectionNames.length - 1) {
                finishCharacterCreation();
              } else {
                navigateCharacterCreation(1);
              }
            }}
            disabled={
              activeSectionIndex === sectionNames.length - 1 &&
              !isCharacterComplete
            }
          >
            {activeSectionIndex === sectionNames.length - 1
              ? "enter world"
              : "next"}{" "}
            <span aria-hidden="true">→</span>
          </button>
        </nav>
        <div
          aria-hidden="true"
          className={`screen-fade screen-fade--white ${isTransitioning ? "screen-fade--visible" : ""}`}
        />
      </main>
    );
  }

  return (
    <main className="landing-screen">
      <h1 className="game-title landing-title">
        latent.
      </h1>
      <div className="landing-action">
        <p className="landing-slogan">
          there is a gift <span>latent</span> in all of us.
        </p>
        <button
          className="game-button"
          type="button"
          onClick={beginCharacterCreation}
          disabled={isTransitioning}
        >
          start
        </button>
      </div>
      <div
        aria-hidden="true"
        className={`screen-fade ${isTransitioning ? "screen-fade--visible" : ""}`}
      />
    </main>
  );
}
