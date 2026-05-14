import type { SocialSectionId } from "@/lib/social/types";

type KeywordRule = {
  canonical: string;
  aliases: string[];
  section: SocialSectionId;
};

export const DEFAULT_SOCIAL_KEYWORDS = [
  "pakistan",
  "china",
  "afghanistan",
  "drone",
  "military",
  "bomb",
  "tank",
  "jet",
  "fighter planes",
  "war",
  "fights",
  "riots",
  "politics",
  "army",
  "navy",
  "soldiers",
  "guns",
] as const;

export const SECTION_LABELS: Record<SocialSectionId, string> = {
  geopolitics: "Geopolitics & Narrative",
  conflict: "Conflict Signals",
  military: "Military Assets & Forces",
};

export const KEYWORD_RULES: KeywordRule[] = [
  {
    canonical: "pakistan",
    aliases: ["pakistan", "pak", "pakistani"],
    section: "geopolitics",
  },
  {
    canonical: "china",
    aliases: ["china", "chinese", "prc"],
    section: "geopolitics",
  },
  {
    canonical: "afghanistan",
    aliases: ["afghanistan", "afghan", "afghaistan"],
    section: "geopolitics",
  },
  {
    canonical: "politics",
    aliases: ["politics", "political", "polictics"],
    section: "geopolitics",
  },
  {
    canonical: "riots",
    aliases: ["riots", "riot", "unrest"],
    section: "geopolitics",
  },
  {
    canonical: "war",
    aliases: ["war", "warfare", "conflict"],
    section: "conflict",
  },
  {
    canonical: "fights",
    aliases: ["fights", "fight", "clash", "clashes"],
    section: "conflict",
  },
  {
    canonical: "drone",
    aliases: ["drone", "uav", "drones"],
    section: "conflict",
  },
  {
    canonical: "bomb",
    aliases: ["bomb", "bombing", "explosion", "ied"],
    section: "conflict",
  },
  {
    canonical: "military",
    aliases: ["military", "militry", "defense", "defence"],
    section: "military",
  },
  {
    canonical: "army",
    aliases: ["army"],
    section: "military",
  },
  {
    canonical: "navy",
    aliases: ["navy", "naval"],
    section: "military",
  },
  {
    canonical: "soldiers",
    aliases: ["soldiers", "soldier", "soliders", "troops"],
    section: "military",
  },
  {
    canonical: "guns",
    aliases: ["guns", "gun", "firearms"],
    section: "military",
  },
  {
    canonical: "tank",
    aliases: ["tank", "tanks", "armored"],
    section: "military",
  },
  {
    canonical: "jet",
    aliases: ["jet", "jets", "fighter jet"],
    section: "military",
  },
  {
    canonical: "fighter planes",
    aliases: ["fighter planes", "fighter plane", "fighter aircraft"],
    section: "military",
  },
];
