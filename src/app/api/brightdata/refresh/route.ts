import { NextResponse } from "next/server";

import {
  buildBrightDataErrorReport,
  buildBrightDataReport,
  readBrightDataCache,
  updateBrightDataCache,
} from "@/lib/brightdata/report";
import { runBrightDataScraper } from "@/lib/brightdata/client";

export async function POST() {
  const previousCache = await readBrightDataCache();

  try {
    const rawPosts = await runBrightDataScraper();
    const cache = await updateBrightDataCache(rawPosts);
    const report = buildBrightDataReport(cache);
    return NextResponse.json(report);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown Bright Data scraper error.";
    const report = buildBrightDataErrorReport(message, previousCache);
    return NextResponse.json(report, { status: 500 });
  }
}
