export function npcFirstName(name: string) {
  return name.trim().split(/\s+/)[0] ?? name;
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function containsNpcIntroduction(text: string, name: string) {
  const givenName = npcFirstName(name);
  const introduction = new RegExp(
    `(?:i(?:'|’)m|i am|my name is)\\s+${escapeRegex(givenName)}\\b|introduc(?:e|es|ed|ing)[^.!?]{0,40}\\b${escapeRegex(givenName)}\\b`,
    "i",
  ).exec(text);
  const firstUse = text.toLocaleLowerCase().indexOf(givenName.toLocaleLowerCase());
  return Boolean(introduction && firstUse >= 0 && introduction.index <= firstUse);
}

function introductionMatch(text: string, name: string) {
  const givenName = npcFirstName(name);
  return new RegExp(
    `(?:i(?:'|’)m|i am|my name is)\\s+${escapeRegex(givenName)}\\b|introduc(?:e|es|ed|ing)[^.!?]{0,40}\\b${escapeRegex(givenName)}\\b`,
    "i",
  ).exec(text);
}

export function concealUndiscoveredNpcName(text: string, name: string) {
  const pattern = new RegExp(
    `\\b(?:${escapeRegex(name)}|${escapeRegex(npcFirstName(name))})(?:('s|’s))?\\b`,
    "gi",
  );
  return text.replace(pattern, (_match, possessive: string | undefined) =>
    possessive ? "the other child’s" : "the other child",
  );
}

export function revealNpcAtIntroduction(text: string, name: string) {
  const introduction = introductionMatch(text, name);
  if (!introduction) {
    return {
      text: concealUndiscoveredNpcName(text, name),
      introduced: false,
    };
  }

  // Hide omniscient uses before the spoken introduction, but preserve the
  // actual name from the introduction onward.
  return {
    text:
      concealUndiscoveredNpcName(text.slice(0, introduction.index), name) +
      text.slice(introduction.index),
    introduced: true,
  };
}
