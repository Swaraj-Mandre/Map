import { NextResponse } from "next/server";

import { buildSocialReport, readSocialCache } from "@/lib/social/report";

export async function GET() {
  const cache = await readSocialCache();
  const report = buildSocialReport(cache);
  return NextResponse.json(report);
}
