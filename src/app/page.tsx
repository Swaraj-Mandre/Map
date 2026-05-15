"use client";

import dynamic from "next/dynamic";

const ThreatIntelDashboard = dynamic(
  () => import("@/registry/blocks/threat-intel-dashboard/page"),
  { ssr: false },
);

export default function HomePage() {
  return <ThreatIntelDashboard />;
}
