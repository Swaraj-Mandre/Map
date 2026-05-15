import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type {
  BrightDataPost,
  BrightDataRawPost,
  BrightDataReport,
} from "@/lib/brightdata/types";

type StoredBrightDataPost = Omit<BrightDataPost, "isNew"> & {
  firstSeenAt: string;
  lastSeenAt: string;
};

type BrightDataCacheFile = {
  version: 1;
  updatedAt: string;
  previousUpdatedAt: string | null;
  posts: StoredBrightDataPost[];
  errors: string[];
};

const CACHE_DIR = path.join(process.cwd(), "data");
const CACHE_FILE = path.join(CACHE_DIR, "brightdata-x-cache.json");

function toDateValue(value: string | null): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function getString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }
  return null;
}

function pickField(record: BrightDataRawPost, keys: string[]): string | null {
  for (const key of keys) {
    const value = getString(record[key]);
    if (value) return value;
  }
  return null;
}

function toClientPost(
  post: StoredBrightDataPost,
  previousUpdatedAt: string | null,
): BrightDataPost {
  const previousTime = previousUpdatedAt ? toDateValue(previousUpdatedAt) : 0;
  const isNew = previousTime > 0 && toDateValue(post.firstSeenAt) > previousTime;
  return {
    id: post.id,
    text: post.text,
    url: post.url,
    createdAt: post.createdAt,
    authorName: post.authorName,
    authorUsername: post.authorUsername,
    isNew,
  };
}

function normalizeRawPost(raw: BrightDataRawPost, index: number) {
  const text =
    pickField(raw, ["text", "description", "content", "post_text", "tweet"]) ?? "";
  const url = pickField(raw, ["url", "post_url", "tweet_url", "link"]);
  const createdAt = pickField(raw, [
    "created_at",
    "createdAt",
    "date",
    "posted_at",
    "timestamp",
    "datetime",
  ]);
  const authorName = pickField(raw, ["name", "author_name", "author", "user_name"]);
  const authorUsername = pickField(raw, ["username", "user", "screen_name", "handle"]);
  const id =
    pickField(raw, ["id", "post_id", "tweet_id"]) ??
    `${authorUsername ?? "x"}-${createdAt ?? "unknown"}-${index}`;

  const normalizedText = normalizeText(text);
  if (!normalizedText) return null;

  return {
    id,
    text: normalizedText,
    url,
    createdAt,
    authorName,
    authorUsername,
  };
}

function createEmptyReport(
  status: BrightDataReport["status"],
  message: string,
  errors: string[] = [],
): BrightDataReport {
  return {
    generatedAt: new Date().toISOString(),
    updatedAt: null,
    status,
    totalPosts: 0,
    newPosts: 0,
    posts: [],
    errors: errors.length ? errors : [message],
  };
}

export async function readBrightDataCache(): Promise<BrightDataCacheFile | null> {
  try {
    const content = await readFile(CACHE_FILE, "utf-8");
    const parsed = JSON.parse(content) as BrightDataCacheFile;
    if (!Array.isArray(parsed.posts)) {
      return null;
    }
    return {
      version: 1,
      updatedAt: parsed.updatedAt ?? new Date(0).toISOString(),
      previousUpdatedAt: parsed.previousUpdatedAt ?? null,
      posts: parsed.posts,
      errors: Array.isArray(parsed.errors) ? parsed.errors : [],
    };
  } catch {
    return null;
  }
}

export async function updateBrightDataCache(
  rawPosts: BrightDataRawPost[],
): Promise<BrightDataCacheFile> {
  const nowIso = new Date().toISOString();
  const existingCache = await readBrightDataCache();
  const existingMap = new Map(
    (existingCache?.posts ?? []).map((post) => [post.id, post]),
  );

  rawPosts.forEach((raw, index) => {
    const normalized = normalizeRawPost(raw, index);
    if (!normalized) return;

    const existing = existingMap.get(normalized.id);
    if (existing) {
      existingMap.set(normalized.id, {
        ...existing,
        ...normalized,
        firstSeenAt: existing.firstSeenAt,
        lastSeenAt: nowIso,
      });
    } else {
      existingMap.set(normalized.id, {
        ...normalized,
        firstSeenAt: nowIso,
        lastSeenAt: nowIso,
      });
    }
  });

  const nextCache: BrightDataCacheFile = {
    version: 1,
    updatedAt: nowIso,
    previousUpdatedAt: existingCache?.updatedAt ?? null,
    posts: Array.from(existingMap.values()).sort(
      (a, b) => toDateValue(b.createdAt) - toDateValue(a.createdAt),
    ),
    errors: [],
  };

  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(CACHE_FILE, `${JSON.stringify(nextCache, null, 2)}\n`, "utf-8");

  return nextCache;
}

export function buildBrightDataReport(
  cache: BrightDataCacheFile | null,
): BrightDataReport {
  if (!cache) {
    return createEmptyReport(
      "empty",
      "No Bright Data cache is available yet. Run refresh to ingest posts.",
    );
  }

  const posts = cache.posts.map((post) => toClientPost(post, cache.previousUpdatedAt));
  const sorted = posts.sort((a, b) => toDateValue(b.createdAt) - toDateValue(a.createdAt));
  const limited = sorted.slice(0, 30);
  const newPosts = limited.filter((post) => post.isNew).length;

  return {
    generatedAt: new Date().toISOString(),
    updatedAt: cache.updatedAt,
    status: cache.errors.length > 0 ? "stale" : "ok",
    totalPosts: limited.length,
    newPosts,
    posts: limited,
    errors: cache.errors,
  };
}

export function buildBrightDataErrorReport(
  message: string,
  previousCache: BrightDataCacheFile | null,
): BrightDataReport {
  const staleReport = buildBrightDataReport(previousCache);
  return {
    ...staleReport,
    status: previousCache ? "stale" : "error",
    errors: [...staleReport.errors, message],
  };
}
