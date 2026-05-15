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

const DATA_DIR = path.join(process.cwd(), "data");
const RAW_FILE = path.join(DATA_DIR, "brightdata-x-raw.json");

export async function POST() {
  const previousCache = await readBrightDataCache();

  try {
    const result = await runBrightDataScraper();
    await mkdir(DATA_DIR, { recursive: true });
    await writeFile(RAW_FILE, `${JSON.stringify(result.rawResponse, null, 2)}\n`, "utf-8");
    const cache = await updateBrightDataCache(result.rows);
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
