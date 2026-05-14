import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  DEFAULT_SOCIAL_KEYWORDS,
  KEYWORD_RULES,
  SECTION_LABELS,
} from "@/lib/social/keywords";
import type {
  ScrapedSocialTweet,
  SocialReport,
  SocialSectionId,
  SocialSectionReport,
  SocialTweet,
} from "@/lib/social/types";

type StoredSocialTweet = Omit<SocialTweet, "isNew"> & {
  firstSeenAt: string;
  lastSeenAt: string;
};

type SocialCacheFile = {
  version: 1;
  updatedAt: string;
  previousUpdatedAt: string | null;
  keywords: string[];
  tweets: StoredSocialTweet[];
  errors: string[];
};

const CACHE_DIR = path.join(process.cwd(), "data");
const CACHE_FILE = path.join(CACHE_DIR, "social-cache.json");
const DEFAULT_OFFICIAL_HANDLES = [
  "pid_gov",
  "pmoindia",
  "spokespersonmod",
  "dawn_com",
  "geoenglish",
  "xinhua",
  "globaltimesnews",
  "cgtnofficial",
  "reutersworld",
  "afp",
  "ap",
  "bbcworld",
];

function isIsoDate(value: string): boolean {
  return !Number.isNaN(Date.parse(value));
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsTerm(text: string, term: string): boolean {
  if (term.includes(" ")) {
    return text.includes(term);
  }
  const pattern = new RegExp(`\\b${escapeRegex(term)}\\b`, "i");
  return pattern.test(text);
}

function scoreTweetEngagement(tweet: Pick<SocialTweet, "likeCount" | "replyCount" | "retweetCount" | "quoteCount">): number {
  return tweet.likeCount + tweet.replyCount * 2 + tweet.retweetCount * 2 + tweet.quoteCount * 2;
}

function toDateValue(value: string): number {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function sortByRecencyAndEngagement<T extends SocialTweet>(tweets: T[]): T[] {
  return [...tweets].sort((a, b) => {
    const dateDiff = toDateValue(b.createdAt) - toDateValue(a.createdAt);
    if (dateDiff !== 0) return dateDiff;
    return scoreTweetEngagement(b) - scoreTweetEngagement(a);
  });
}

function getConfiguredKeywords(): string[] {
  const fromEnv = process.env.TWITTER_SCRAPER_KEYWORDS
    ?.split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  if (fromEnv && fromEnv.length > 0) {
    return Array.from(new Set(fromEnv));
  }

  return [...DEFAULT_SOCIAL_KEYWORDS];
}

function getOfficialHandlesSet(): Set<string> {
  const handles = process.env.TWITTER_SCRAPER_OFFICIAL_ACCOUNTS
    ?.split(",")
    .map((handle) => handle.trim().replace(/^@/, "").toLowerCase())
    .filter(Boolean);
  const merged = [...(handles ?? []), ...DEFAULT_OFFICIAL_HANDLES];
  return new Set(merged);
}

function classifyTweet(
  text: string,
  configuredKeywords: string[],
): { matchedKeywords: string[]; sectionIds: SocialSectionId[] } {
  const normalized = text.toLowerCase();
  const matchedKeywords = new Set<string>();
  const sectionScores = new Map<SocialSectionId, number>([
    ["geopolitics", 0],
    ["conflict", 0],
    ["military", 0],
  ]);

  for (const rule of KEYWORD_RULES) {
    const matched = rule.aliases.some((alias) => containsTerm(normalized, alias));
    if (!matched) continue;
    matchedKeywords.add(rule.canonical);
    sectionScores.set(rule.section, (sectionScores.get(rule.section) ?? 0) + 1);
  }

  for (const keyword of configuredKeywords) {
    if (containsTerm(normalized, keyword)) {
      matchedKeywords.add(keyword);
    }
  }

  const sectionIds = Array.from(sectionScores.entries())
    .filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id);

  return {
    matchedKeywords: Array.from(matchedKeywords),
    sectionIds,
  };
}

function normalizeScrapedTweet(
  tweet: ScrapedSocialTweet,
  configuredKeywords: string[],
  officialHandlesSet: Set<string>,
): Omit<StoredSocialTweet, "firstSeenAt" | "lastSeenAt"> | null {
  const id = String(tweet.id || "").trim();
  const username = String(tweet.username || "").trim().replace(/^@/, "");
  const text = normalizeWhitespace(String(tweet.text || ""));
  const createdAt = String(tweet.createdAt || "");

  if (!id || !username || !text || !createdAt || !isIsoDate(createdAt)) {
    return null;
  }

  const classified = classifyTweet(text, configuredKeywords);
  if (classified.matchedKeywords.length === 0 || classified.sectionIds.length === 0) {
    return null;
  }

  const isOfficial =
    Boolean(tweet.isVerified) || officialHandlesSet.has(username.toLowerCase());
  const displayName = normalizeWhitespace(String(tweet.displayName || username));

  const safeUrl = tweet.url?.trim()
    ? tweet.url.trim()
    : `https://x.com/${username}/status/${id}`;

  return {
    id,
    username,
    displayName,
    text,
    createdAt: new Date(createdAt).toISOString(),
    url: safeUrl,
    likeCount: Number(tweet.likeCount ?? 0) || 0,
    replyCount: Number(tweet.replyCount ?? 0) || 0,
    retweetCount: Number(tweet.retweetCount ?? 0) || 0,
    quoteCount: Number(tweet.quoteCount ?? 0) || 0,
    lang: tweet.lang,
    isOfficial,
    matchedKeywords: classified.matchedKeywords,
    sectionIds: classified.sectionIds,
  };
}

function getTopKeywords(tweets: SocialTweet[], limit = 5): string[] {
  const keywordCounts = new Map<string, number>();
  for (const tweet of tweets) {
    for (const keyword of tweet.matchedKeywords) {
      keywordCounts.set(keyword, (keywordCounts.get(keyword) ?? 0) + 1);
    }
  }
  return Array.from(keywordCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([keyword]) => keyword);
}

function buildSectionSummary(
  sectionName: string,
  tweets: SocialTweet[],
  topKeywords: string[],
  officialCount: number,
  correlatedCount: number,
): string {
  if (tweets.length === 0) {
    return `No current activity classified under ${sectionName}.`;
  }

  const keywordsText =
    topKeywords.length > 0 ? topKeywords.join(", ") : "broad mixed signals";

  return `${tweets.length} tweets detected (${officialCount} official / ${correlatedCount} correlated). Top context terms: ${keywordsText}.`;
}

function buildGlobalSummary(
  sections: SocialSectionReport[],
  totalTweets: number,
  newTweets: number,
): string {
  if (totalTweets === 0) {
    return "No tweets are available yet. Trigger refresh after configuring twscrape credentials.";
  }

  const active = sections
    .filter((section) => section.tweetCount > 0)
    .sort((a, b) => b.tweetCount - a.tweetCount)
    .slice(0, 2)
    .map((section) => section.name);

  if (active.length === 0) {
    return `${totalTweets} tweets collected, but none matched the configured context rules.`;
  }

  return `${totalTweets} contextual tweets tracked (${newTweets} new since last refresh). Strongest activity: ${active.join(" and ")}.`;
}

function toClientTweet(
  tweet: StoredSocialTweet,
  previousUpdatedAt: string | null,
): SocialTweet {
  const previousTime = previousUpdatedAt ? toDateValue(previousUpdatedAt) : 0;
  const isNew = previousTime > 0 && toDateValue(tweet.firstSeenAt) > previousTime;

  return {
    id: tweet.id,
    username: tweet.username,
    displayName: tweet.displayName,
    text: tweet.text,
    createdAt: tweet.createdAt,
    url: tweet.url,
    likeCount: tweet.likeCount,
    replyCount: tweet.replyCount,
    retweetCount: tweet.retweetCount,
    quoteCount: tweet.quoteCount,
    lang: tweet.lang,
    isOfficial: tweet.isOfficial,
    matchedKeywords: tweet.matchedKeywords,
    sectionIds: tweet.sectionIds,
    isNew,
  };
}

function createEmptyReport(
  status: SocialReport["status"],
  message: string,
  errors: string[] = [],
): SocialReport {
  return {
    generatedAt: new Date().toISOString(),
    updatedAt: null,
    status,
    summary: message,
    keywords: getConfiguredKeywords(),
    totalTweets: 0,
    newTweets: 0,
    sections: (Object.keys(SECTION_LABELS) as SocialSectionId[]).map((id) => ({
      id,
      name: SECTION_LABELS[id],
      summary: `No current activity classified under ${SECTION_LABELS[id]}.`,
      tweetCount: 0,
      newTweetCount: 0,
      topKeywords: [],
      officialTweets: [],
      correlatedTweets: [],
    })),
    errors,
  };
}

export async function readSocialCache(): Promise<SocialCacheFile | null> {
  try {
    const content = await readFile(CACHE_FILE, "utf-8");
    const parsed = JSON.parse(content) as SocialCacheFile;

    if (!Array.isArray(parsed.tweets)) {
      return null;
    }

    return {
      version: 1,
      updatedAt: parsed.updatedAt ?? new Date(0).toISOString(),
      previousUpdatedAt: parsed.previousUpdatedAt ?? null,
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords : getConfiguredKeywords(),
      tweets: parsed.tweets,
      errors: Array.isArray(parsed.errors) ? parsed.errors : [],
    };
  } catch {
    return null;
  }
}

export async function updateSocialCache(
  scrapedTweets: ScrapedSocialTweet[],
): Promise<SocialCacheFile> {
  const configuredKeywords = getConfiguredKeywords();
  const officialHandlesSet = getOfficialHandlesSet();
  const nowIso = new Date().toISOString();
  const existingCache = await readSocialCache();
  const existingMap = new Map(
    (existingCache?.tweets ?? []).map((tweet) => [tweet.id, tweet]),
  );

  for (const rawTweet of scrapedTweets) {
    const normalized = normalizeScrapedTweet(
      rawTweet,
      configuredKeywords,
      officialHandlesSet,
    );
    if (!normalized) continue;

    const existing = existingMap.get(normalized.id);
    if (existing) {
      existingMap.set(normalized.id, {
        ...existing,
        ...normalized,
        firstSeenAt: existing.firstSeenAt,
        lastSeenAt: nowIso,
      });
      continue;
    }

    existingMap.set(normalized.id, {
      ...normalized,
      firstSeenAt: nowIso,
      lastSeenAt: nowIso,
    });
  }

  const nextCache: SocialCacheFile = {
    version: 1,
    updatedAt: nowIso,
    previousUpdatedAt: existingCache?.updatedAt ?? null,
    keywords: configuredKeywords,
    tweets: Array.from(existingMap.values()).sort(
      (a, b) => toDateValue(b.createdAt) - toDateValue(a.createdAt),
    ),
    errors: [],
  };

  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(CACHE_FILE, `${JSON.stringify(nextCache, null, 2)}\n`, "utf-8");

  return nextCache;
}

export function buildSocialReport(cache: SocialCacheFile | null): SocialReport {
  if (!cache) {
    return createEmptyReport(
      "empty",
      "No social cache is available yet. Run social refresh to ingest tweets.",
    );
  }

  const sectionIds = Object.keys(SECTION_LABELS) as SocialSectionId[];
  const tweets = cache.tweets.map((tweet) => toClientTweet(tweet, cache.previousUpdatedAt));
  const totalTweets = tweets.length;
  const newTweets = tweets.filter((tweet) => tweet.isNew).length;

  const sections: SocialSectionReport[] = sectionIds.map((sectionId) => {
    const sectionTweets = sortByRecencyAndEngagement(
      tweets.filter((tweet) => tweet.sectionIds.includes(sectionId)),
    );
    const officialTweets = sectionTweets.filter((tweet) => tweet.isOfficial);
    const officialKeywords = new Set(officialTweets.flatMap((tweet) => tweet.matchedKeywords));

    const correlatedTweets = sortByRecencyAndEngagement(
      sectionTweets
        .filter((tweet) => !tweet.isOfficial)
        .map((tweet) => {
          const overlap = tweet.matchedKeywords.filter((keyword) =>
            officialKeywords.has(keyword),
          ).length;
          return { tweet, overlap };
        })
        .filter((entry) => entry.overlap > 0)
        .sort((a, b) => b.overlap - a.overlap)
        .map((entry) => entry.tweet),
    );

    const topKeywords = getTopKeywords(sectionTweets);

    return {
      id: sectionId,
      name: SECTION_LABELS[sectionId],
      summary: buildSectionSummary(
        SECTION_LABELS[sectionId],
        sectionTweets,
        topKeywords,
        officialTweets.length,
        correlatedTweets.length,
      ),
      tweetCount: sectionTweets.length,
      newTweetCount: sectionTweets.filter((tweet) => tweet.isNew).length,
      topKeywords,
      officialTweets: officialTweets.slice(0, 5),
      correlatedTweets: correlatedTweets.slice(0, 5),
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    updatedAt: cache.updatedAt,
    status: cache.errors.length > 0 ? "stale" : "ok",
    summary: buildGlobalSummary(sections, totalTweets, newTweets),
    keywords: cache.keywords,
    totalTweets,
    newTweets,
    sections,
    errors: cache.errors,
  };
}

export function buildErrorReport(message: string, previousCache: SocialCacheFile | null): SocialReport {
  const staleReport = buildSocialReport(previousCache);
  return {
    ...staleReport,
    status: previousCache ? "stale" : "error",
    summary: previousCache
      ? `${staleReport.summary} Latest refresh failed: ${message}`
      : message,
    errors: [...staleReport.errors, message],
  };
}
