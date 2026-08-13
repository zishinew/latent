function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const thirdPersonVerbs: Record<string, string> = {
  asks: "ask",
  does: "do",
  feels: "feel",
  has: "have",
  hears: "hear",
  holds: "hold",
  is: "are",
  keeps: "keep",
  looks: "look",
  notices: "notice",
  reaches: "reach",
  runs: "run",
  says: "say",
  sees: "see",
  sits: "sit",
  stands: "stand",
  traces: "trace",
  tries: "try",
  turns: "turn",
  waits: "wait",
  walks: "walk",
  watches: "watch",
};

export function rewritePlayerReferences(text: string, playerName: string) {
  const fullName = playerName.trim();
  if (!fullName) return text;
  const firstName = fullName.split(/\s+/)[0] ?? fullName;
  const names = [...new Set([fullName, firstName])]
    .sort((left, right) => right.length - left.length)
    .map(escapeRegex)
    .join("|");
  const namePattern = new RegExp(`\\b(?:${names})(?:('s|’s))?\\b`, "g");
  const replaced = text.replace(
    namePattern,
    (_match, possessive: string | undefined, offset: number) => {
      if (possessive) return "your";
      const before = text.slice(0, offset);
      return !before.trim() || /[.!?][”"']?\s*$/.test(before) ? "You" : "you";
    },
  );

  const verbPattern = new RegExp(
    `\\b(You|you)\\s+(${Object.keys(thirdPersonVerbs).join("|")})\\b`,
    "g",
  );
  return replaced.replace(
    verbPattern,
    (_match, pronoun: string, verb: string) =>
      `${pronoun} ${thirdPersonVerbs[verb]}`,
  );
}
