import { NextResponse } from "next/server";

import {
  buildTelegramErrorReport,
  buildTelegramReport,
  readTelegramCache,
  updateTelegramCache,
} from "../../../../../lib/telegram/report";
import { runTelegramScraper } from "../../../../../lib/telegram/scraper";

export async function POST() {
  const previousCache = await readTelegramCache();

  try {
    const messages = await runTelegramScraper();
    const cache = await updateTelegramCache(messages);
    const report = buildTelegramReport(cache);
    return NextResponse.json(report);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown telegram scraper error.";
    const report = buildTelegramErrorReport(message, previousCache);
    return NextResponse.json(report, { status: 500 });
  }
}
