export const npcArchetypes = [
  "deredere",
  "tsundere",
  "kuudere",
  "dandere",
  "himedere",
  "oujidere",
  "genki",
  "stoic",
  "rival",
  "trickster",
] as const;

export const socialDifficulties = ["easy", "standard", "hard"] as const;
export const crushStyles = [
  "open",
  "shy",
  "teasing",
  "guarded",
  "oblivious",
] as const;

export type NpcArchetype = (typeof npcArchetypes)[number];
export type SocialDifficulty = (typeof socialDifficulties)[number];
export type CrushStyle = (typeof crushStyles)[number];

export type NpcProfile = {
  id: string;
  name: string;
  age: number;
  archetype: NpcArchetype;
  traits: string[];
  values: string[];
  likes: string[];
  dislikes: string[];
  socialDifficulty: SocialDifficulty;
  voice: string;
  privateGoal: string;
  insecurity: string;
  crushStyle: CrushStyle;
};

export function canPerceiveThoughts(gift: string | null | undefined) {
  return /mind\s*read|telepath|thought\s*read|empath|psychic|emotion\s*(read|sense)|aura\s*read/i.test(
    gift ?? "",
  );
}

export function relationshipContactThreshold(difficulty: SocialDifficulty) {
  if (difficulty === "easy") return { level: 10, interactions: 2 };
  if (difficulty === "hard") return { level: 22, interactions: 4 };
  return { level: 15, interactions: 3 };
}

export function relationshipImpactThreshold(difficulty: SocialDifficulty) {
  if (difficulty === "easy") return 2;
  if (difficulty === "hard") return 4;
  return 3;
}
