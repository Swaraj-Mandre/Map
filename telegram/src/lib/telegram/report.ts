import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type {
  ScrapedTelegramMessage,
  TelegramChannelSummary,
  TelegramMessage,
  TelegramReport,
} from "./types";

type StoredTelegramMessage = Omit<TelegramMessage, "isNew"> & {
  firstSeenAt: string;
  lastSeenAt: string;
};

type TelegramCacheFile = {
  version: 1;
  updatedAt: string;
  previousUpdatedAt: string | null;
  messages: StoredTelegramMessage[];
  errors: string[];
};

const CACHE_DIR = path.join(process.cwd(), "data");
const CACHE_FILE = path.join(CACHE_DIR, "telegram-cache.json");

function toDateValue(value: string): number {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function toClientMessage(
  message: StoredTelegramMessage,
  previousUpdatedAt: string | null,
): TelegramMessage {
  const previousTime = previousUpdatedAt ? toDateValue(previousUpdatedAt) : 0;
  const isNew = previousTime > 0 && toDateValue(message.firstSeenAt) > previousTime;

  return {
    id: message.id,
    channelId: message.channelId,
    channelTitle: message.channelTitle,
    channelUsername: message.channelUsername,
    messageId: message.messageId,
    text: message.text,
    createdAt: message.createdAt,
    url: message.url,
    isNew,
  };
}

function buildChannelSummaries(messages: TelegramMessage[]): TelegramChannelSummary[] {
  const map = new Map<string, TelegramChannelSummary>();
  for (const message of messages) {
    const existing = map.get(message.channelId);
    const next = existing ?? {
      channelId: message.channelId,
      channelTitle: message.channelTitle,
      channelUsername: message.channelUsername,
      totalMessages: 0,
      newMessages: 0,
    };
    next.totalMessages += 1;
    if (message.isNew) {
      next.newMessages += 1;
    }
    map.set(message.channelId, next);
  }
  return Array.from(map.values()).sort((a, b) => b.totalMessages - a.totalMessages);
}

function createEmptyReport(
  status: TelegramReport["status"],
  message: string,
  errors: string[] = [],
): TelegramReport {
  return {
    generatedAt: new Date().toISOString(),
    updatedAt: null,
    status,
    totalMessages: 0,
    newMessages: 0,
    channels: [],
    messages: [],
    errors: errors.length ? errors : [message],
  };
}

export async function readTelegramCache(): Promise<TelegramCacheFile | null> {
  try {
    const content = await readFile(CACHE_FILE, "utf-8");
    const parsed = JSON.parse(content) as TelegramCacheFile;
    if (!Array.isArray(parsed.messages)) {
      return null;
    }
    return {
      version: 1,
      updatedAt: parsed.updatedAt ?? new Date(0).toISOString(),
      previousUpdatedAt: parsed.previousUpdatedAt ?? null,
      messages: parsed.messages,
      errors: Array.isArray(parsed.errors) ? parsed.errors : [],
    };
  } catch {
    return null;
  }
}

export async function updateTelegramCache(
  scrapedMessages: ScrapedTelegramMessage[],
): Promise<TelegramCacheFile> {
  const nowIso = new Date().toISOString();
  const existingCache = await readTelegramCache();
  const existingMap = new Map(
    (existingCache?.messages ?? []).map((message) => [message.id, message]),
  );

  for (const raw of scrapedMessages) {
    const text = normalizeText(raw.text ?? "");
    if (!raw.id || !raw.channelId || !raw.messageId || !text) {
      continue;
    }

    const normalized: Omit<StoredTelegramMessage, "firstSeenAt" | "lastSeenAt"> = {
      id: raw.id,
      channelId: raw.channelId,
      channelTitle: raw.channelTitle,
      channelUsername: raw.channelUsername,
      messageId: raw.messageId,
      text,
      createdAt: new Date(raw.createdAt).toISOString(),
      url: raw.url,
    };

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
  }

  const nextCache: TelegramCacheFile = {
    version: 1,
    updatedAt: nowIso,
    previousUpdatedAt: existingCache?.updatedAt ?? null,
    messages: Array.from(existingMap.values()).sort(
      (a, b) => toDateValue(b.createdAt) - toDateValue(a.createdAt),
    ),
    errors: [],
  };

  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(CACHE_FILE, `${JSON.stringify(nextCache, null, 2)}\n`, "utf-8");

  return nextCache;
}

export function buildTelegramReport(cache: TelegramCacheFile | null): TelegramReport {
  if (!cache) {
    return createEmptyReport(
      "empty",
      "No Telegram cache is available yet. Run refresh to ingest messages.",
    );
  }

  const messages = cache.messages.map((message) =>
    toClientMessage(message, cache.previousUpdatedAt),
  );

  const sorted = messages.sort(
    (a, b) => toDateValue(b.createdAt) - toDateValue(a.createdAt),
  );

  const limited = sorted.slice(0, 30);
  const newMessages = limited.filter((message) => message.isNew).length;

  return {
    generatedAt: new Date().toISOString(),
    updatedAt: cache.updatedAt,
    status: cache.errors.length > 0 ? "stale" : "ok",
    totalMessages: limited.length,
    newMessages,
    channels: buildChannelSummaries(limited),
    messages: limited,
    errors: cache.errors,
  };
}

export function buildTelegramErrorReport(
  message: string,
  previousCache: TelegramCacheFile | null,
): TelegramReport {
  const staleReport = buildTelegramReport(previousCache);
  return {
    ...staleReport,
    status: previousCache ? "stale" : "error",
    errors: [...staleReport.errors, message],
  };
}
