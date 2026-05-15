import { NextResponse } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  buildBrightDataErrorReport,
  buildBrightDataReport,
  readBrightDataCache,
  updateBrightDataCache,
} from "@/lib/brightdata/report";
import { runBrightDataScraper } from "@/lib/brightdata/client";
import type { BrightDataRawPost } from "@/lib/brightdata/types";

// Helper: extract rows from various payload shapes
function extractRows(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  const record = payload as Record<string, unknown>;
  const candidateKeys = ["data", "results", "result", "items", "posts", "output"];
  for (const key of candidateKeys) {
    const value = record[key];
    if (Array.isArray(value)) return value;
  }
  const nestedArrays = Object.values(record).filter(Array.isArray) as unknown[][];
  return nestedArrays[0] ?? [];
}

function toSnapshotId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  return (record["snapshot_id"] as string) ?? (record["snapshotId"] as string) ?? (record["id"] as string) ?? null;
}

const DATA_DIR = path.join(process.cwd(), "data");
const RAW_FILE = path.join(DATA_DIR, "brightdata-x-raw.json");

export async function POST() {
  const previousCache = await readBrightDataCache();

  try {
    const result = await runBrightDataScraper();

    // If the scraper returned only a snapshot id, poll the download endpoint
    const snapshotId = toSnapshotId(result.rawResponse);
    let finalRaw = result.rawResponse;
    let rows = result.rows;

    if (snapshotId) {
      const token = process.env.BRIGHTDATA_API_TOKEN ?? "";
      const downloadEndpoint =
        process.env.BRIGHTDATA_DOWNLOAD_ENDPOINT ??
        "https://api.brightdata.com/datasets/v3/snapshots/{snapshot_id}/download";
      const timeoutMs = Number(process.env.BRIGHTDATA_TIMEOUT_MS ?? 420000);
      const pollIntervalMs = Number(process.env.BRIGHTDATA_POLL_INTERVAL_MS ?? 10000);

      const downloadUrl = downloadEndpoint.replace("{snapshot_id}", snapshotId);
      const startedAt = Date.now();

      while (Date.now() - startedAt < timeoutMs) {
        const res = await fetch(downloadUrl, {
          method: "GET",
          headers: {
            Authorization: token ? `Bearer ${token}` : "",
            Accept: "application/json",
          },
        });

        if (res.status === 202 || res.status === 404) {
          await new Promise((r) => setTimeout(r, pollIntervalMs));
          continue;
        }

        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || "Bright Data download failed.");
        }

        const payload = await res.json();
        const extracted = extractRows(payload);
        if (extracted.length > 0) {
          finalRaw = payload;
          rows = extracted as unknown[];
          break;
        }

        // empty result, wait and retry
        await new Promise((r) => setTimeout(r, pollIntervalMs));
      }
    }

    await mkdir(DATA_DIR, { recursive: true });
    await writeFile(RAW_FILE, `${JSON.stringify(finalRaw, null, 2)}\n`, "utf-8");
    const cache = await updateBrightDataCache(rows as BrightDataRawPost[]);
    const report = buildBrightDataReport(cache);
    return NextResponse.json(report);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown Bright Data scraper error.";
    await mkdir(DATA_DIR, { recursive: true });
    await writeFile(
      RAW_FILE,
      `${JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          error: message,
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );
    const report = buildBrightDataErrorReport(message, previousCache);
    return NextResponse.json(report, { status: 500 });
  }
}
