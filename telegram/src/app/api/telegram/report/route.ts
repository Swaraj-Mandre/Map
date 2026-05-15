import { NextResponse } from "next/server";

import { buildTelegramReport, readTelegramCache } from "../../../../../lib/telegram/report";

export async function GET() {
  const cache = await readTelegramCache();
  const report = buildTelegramReport(cache);
  return NextResponse.json(report);
}
