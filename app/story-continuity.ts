function normalizedWords(text: string) {
  return text
    .toLocaleLowerCase()
    .replace(/[“”‘’]/g, "'")
    .replace(/[^\p{L}\p{N}'\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function substantialLines(text: string) {
  return text
    .split(/(?<=[.!?])\s+|[\r\n]+/)
    .map((line) => normalizedWords(line))
    .filter((words) => words.length >= 6)
    .map((words) => words.join(" "));
}

function textFromUnknown(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(textFromUnknown);
  if (!value || typeof value !== "object") return [];
  return Object.values(value as Record<string, unknown>).flatMap(textFromUnknown);
}

function bigrams(words: string[]) {
  const result = new Set<string>();
  for (let index = 0; index + 1 < words.length; index += 1) {
    result.add(`${words[index]} ${words[index + 1]}`);
  }
  return result;
}

function overlap(left: Set<string>, right: Set<string>) {
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const item of left) if (right.has(item)) shared += 1;
  return shared / Math.min(left.size, right.size);
}

/** Rejects a continuation that substantially replays a recent scene beat. */
export function repeatsRecentBeat(candidate: string, recent: unknown[]) {
  const candidateWords = normalizedWords(candidate);
  if (candidateWords.length < 6) return false;
  const candidateLines = substantialLines(candidate);
  const candidateBigrams = bigrams(candidateWords);

  return textFromUnknown(recent).some((source) => {
    const sourceWords = normalizedWords(source);
    if (sourceWords.length < 6) return false;
    const sourceNormalized = sourceWords.join(" ");
    if (
      candidateLines.some(
        (line) => sourceNormalized.includes(line) || line.includes(sourceNormalized),
      )
    ) {
      return true;
    }
    return overlap(candidateBigrams, bigrams(sourceWords)) >= 0.72;
  });
}
