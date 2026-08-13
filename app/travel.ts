export type TravelDestination = {
  key:
    | "home"
    | "school"
    | "park"
    | "library"
    | "shop"
    | "training"
    | "friend"
    | "family"
    | "harbor"
    | "downtown"
    | "beach";
  label: string;
};

type DestinationRule = {
  key: TravelDestination["key"];
  label: string;
  pattern: RegExp;
};

const destinationRules: DestinationRule[] = [
  {
    key: "friend",
    label: "your friend's house",
    pattern:
      /\b(?:friend'?s\s+(?:house|home|place)|(?:his|her|their)\s+place)\b/i,
  },
  {
    key: "family",
    label: "your family's home",
    pattern:
      /\b(?:grandma|grandpa|grandmother|grandfather|aunt|uncle|dad|mom|mother|father|family)'?s?\s*(?:house|home|place)\b/i,
  },
  {
    key: "home",
    label: "home",
    pattern: /\b(?:home|my\s+(?:house|apartment|place|room)|the\s+house)\b/i,
  },
  { key: "school", label: "school", pattern: /\b(?:school|academy|classroom)\b/i },
  { key: "park", label: "the park", pattern: /\bpark\b/i },
  { key: "library", label: "the library", pattern: /\b(?:library|bookstore)\b/i },
  {
    key: "shop",
    label: "the shop",
    pattern:
      /\b(?:shop|store|market|supermarket|cafe|convenience\s+store|bakery)\b/i,
  },
  {
    key: "training",
    label: "the training ground",
    pattern:
      /\b(?:gym|dojo|training\s+(?:ground|field|center|centre))\b/i,
  },
  { key: "harbor", label: "the harbor", pattern: /\b(?:harbor|harbour|waterfront|pier)\b/i },
  { key: "downtown", label: "downtown", pattern: /\b(?:downtown|city center|city centre)\b/i },
  { key: "beach", label: "the beach", pattern: /\b(?:beach|coast)\b/i },
];

const travelVerbPattern =
  /\b(?:go(?:ing)?\s+(?:back\s+to|to|over\s+to|home\b)|head(?:ing)?\s+(?:back\s+)?(?:to|toward|towards|over\s+to|home\b)|walk(?:ing)?\s+(?:back\s+)?(?:to|toward|towards|home\b)|return(?:ing)?\s+(?:to|home\b)|travel(?:ling|ing)?\s+to|drive\s+(?:back\s+)?(?:to|home\b)|ride\s+(?:back\s+)?(?:to|home\b)|take\s+(?:the\s+)?(?:bus|train|streetcar|subway|bike|bicycle|taxi|car)\s+to|make\s+my\s+way\s+(?:over\s+)?to|hurry\s+(?:back\s+)?(?:to|home\b)|come(?:ing)?\s+(?:back\s+)?(?:to|home\b)|get(?:ting)?\s+(?:back\s+)?(?:to|home\b)|leave\s+(?:for|to)|set\s+(?:off|out)\s+for)\b/i;

const negatedTravelPattern =
  /\b(?:don'?t|do not|didn'?t|won'?t|will not|can'?t|cannot|never)\s+(?:want\s+to\s+)?(?:go|head|walk|travel|drive|ride|come|get)\b/i;

export function travelDestination(intent: string): TravelDestination | null {
  if (!intent || negatedTravelPattern.test(intent)) return null;
  if (!travelVerbPattern.test(intent)) return null;
  for (const rule of destinationRules) {
    if (rule.pattern.test(intent)) {
      return { key: rule.key, label: rule.label };
    }
  }
  return null;
}

const atLocationPatterns: Record<TravelDestination["key"], RegExp> = {
  home: /\b(?:home|house|apartment|my room|your room)\b/i,
  school: /\b(?:school|academy|classroom)\b/i,
  park: /\bpark\b/i,
  library: /\b(?:library|bookstore)\b/i,
  shop: /\b(?:shop|store|market|cafe|supermarket|bakery)\b/i,
  training: /\b(?:gym|dojo|training\s+(?:ground|field|center|centre))\b/i,
  friend: /\b(?:friend'?s\s+(?:house|home|place))\b/i,
  family: /\b(?:grandma|grandpa|grandmother|grandfather|aunt|uncle|dad|mom|mother|father|family)'?s?\b/i,
  harbor: /\b(?:harbor|harbour|waterfront|pier)\b/i,
  downtown: /\b(?:downtown|city center|city centre)\b/i,
  beach: /\b(?:beach|coast)\b/i,
};

export function isAtLocation(
  destination: TravelDestination,
  location: string | null,
) {
  if (!location) return false;
  return atLocationPatterns[destination.key].test(location);
}

const arrivalCopy: Partial<Record<TravelDestination["key"], string>> = {
  home: "You head home, and the familiar route settles behind you.",
  school: "You make your way to school, and the walk passes without incident.",
  park: "You walk to the park and step onto the green without trouble.",
  library: "You travel to the library and slip into the quiet.",
  shop: "You walk to the shop and arrive without trouble.",
  training: "You head over to the training ground and arrive ready.",
  harbor: "You make your way to the harbor, and the breeze smells of salt.",
  beach: "You head to the beach, and the sand shifts underfoot.",
  downtown: "You walk downtown, and the streets grow busier as you arrive.",
};

export function travelNarration(
  destination: TravelDestination,
  atLocation: boolean,
) {
  if (atLocation) {
    return `You are already ${destination.label}, so there is nowhere to travel.`;
  }
  return (
    arrivalCopy[destination.key] ??
    `You make your way to ${destination.label} without trouble.`
  );
}