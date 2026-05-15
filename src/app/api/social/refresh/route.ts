import { NextResponse } from "next/server";

import {
  buildErrorReport,
  buildSocialReport,
  readSocialCache,
  updateSocialCache,
} from "@/lib/social/report";
import { runSocialScraper } from "@/lib/social/scraper";

export async function POST() {
  const previousCache = await readSocialCache();

  try {
    const tweets = await runSocialScraper();
    const cache = await updateSocialCache(tweets);
    const report = buildSocialReport(cache);
    return NextResponse.json(report);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown social scraper error.";
    const report = buildErrorReport(message, previousCache);
    return NextResponse.json(report, { status: 500 });
  }
}
