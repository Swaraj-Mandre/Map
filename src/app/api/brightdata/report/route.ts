import { NextResponse } from "next/server";

import { buildBrightDataReport, readBrightDataCache } from "@/lib/brightdata/report";

export async function GET() {
  const cache = await readBrightDataCache();
  const report = buildBrightDataReport(cache);
  return NextResponse.json(report);
}
