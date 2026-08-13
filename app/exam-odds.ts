export const examAttributeNames = [
  "Strength",
  "Agility",
  "Willpower",
  "Intelligence",
  "Vigor",
  "Rapport",
] as const;

export type ExamAttributeName = (typeof examAttributeNames)[number];
export type ExamSchoolDifficulty = "easy" | "medium" | "hard";

const schoolConfig: Record<
  ExamSchoolDifficulty,
  { base: number; slope: number; floor: number; ceiling: number }
> = {
  easy: { base: 45, slope: 3.5, floor: 25, ceiling: 95 },
  medium: { base: 20, slope: 3.8, floor: 8, ceiling: 88 },
  hard: { base: 6, slope: 2.9, floor: 2, ceiling: 80 },
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

/**
 * Acceptance odds scale with overall readiness: the average of all six
 * attributes plus Gift Mastery. Every school becomes easier to enter as
 * readiness rises, but harder schools always demand more.
 */
export function acceptanceChance(
  attributes: Record<ExamAttributeName, number>,
  giftMastery: number,
  difficulty: ExamSchoolDifficulty,
) {
  const overall =
    examAttributeNames.reduce(
      (total, name) => total + clamp(attributes[name] ?? 0, 0, 100),
      0,
    ) / examAttributeNames.length;
  const readiness = 0.6 * overall + 0.4 * clamp(giftMastery, 0, 100);
  const { base, slope, floor, ceiling } = schoolConfig[difficulty];
  return clamp(Math.round(base + readiness * slope), floor, ceiling);
}