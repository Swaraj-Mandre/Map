export type ThreatSeverity = "low" | "medium" | "high";

export interface ThreatFeedItem {
  id: string;
  title: string;
  summary: string;
  timestamp: string;
  source: string;
  locationLabel: string;
  coordinates: [number, number];
  severity: ThreatSeverity;
  view: "poi" | "country" | "bilateral";
}

export interface PoiTrail {
  id: string;
  label: string;
  role: string;
  color: string;
  path: [number, number][];
}

export interface BilateralArc {
  id: string;
  fromLabel: string;
  toLabel: string;
  from: [number, number];
  to: [number, number];
  intensity: number;
}

export const poiTrails: PoiTrail[] = [
  {
    id: "poi-1",
    label: "POI Alpha",
    role: "Procurement Lead",
    color: "#ef4444",
    path: [
      [66.97, 24.86],
      [67.04, 25.08],
      [67.21, 25.27],
      [67.39, 25.38],
    ],
  },
  {
    id: "poi-2",
    label: "POI Delta",
    role: "Signals Specialist",
    color: "#3b82f6",
    path: [
      [73.05, 33.68],
      [72.91, 33.78],
      [72.73, 33.87],
      [72.6, 33.95],
    ],
  },
  {
    id: "poi-3",
    label: "POI Kilo",
    role: "Field Coordinator",
    color: "#22c55e",
    path: [
      [80.25, 13.09],
      [80.07, 13.2],
      [79.92, 13.29],
      [79.74, 13.4],
    ],
  },
];

export const bilateralArcs: BilateralArc[] = [
  {
    id: "arc-1",
    fromLabel: "Islamabad",
    toLabel: "Kathmandu",
    from: [73.0479, 33.6844],
    to: [85.324, 27.7172],
    intensity: 0.82,
  },
  {
    id: "arc-2",
    fromLabel: "Dhaka",
    toLabel: "Kunming",
    from: [90.4125, 23.8103],
    to: [102.8329, 24.8801],
    intensity: 0.67,
  },
  {
    id: "arc-3",
    fromLabel: "Yangon",
    toLabel: "Colombo",
    from: [96.1951, 16.8661],
    to: [79.8612, 6.9271],
    intensity: 0.58,
  },
];

export const indiaActivityPoints: GeoJSON.FeatureCollection<
  GeoJSON.Point,
  { title: string; severity: ThreatSeverity; source: string }
> = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: {
        title: "Repeated drone signal pings",
        severity: "high",
        source: "ADS-B + SIGINT",
      },
      geometry: { type: "Point", coordinates: [74.87, 32.73] },
    },
    {
      type: "Feature",
      properties: {
        title: "Port logistics surge",
        severity: "medium",
        source: "Open shipping feeds",
      },
      geometry: { type: "Point", coordinates: [72.82, 18.94] },
    },
    {
      type: "Feature",
      properties: {
        title: "Narrative amplification detected",
        severity: "medium",
        source: "Social stream monitor",
      },
      geometry: { type: "Point", coordinates: [77.21, 28.61] },
    },
    {
      type: "Feature",
      properties: {
        title: "Unusual air corridor density",
        severity: "high",
        source: "Civilian ADS-B",
      },
      geometry: { type: "Point", coordinates: [88.36, 22.57] },
    },
    {
      type: "Feature",
      properties: {
        title: "Fuel depot convoy chatter",
        severity: "low",
        source: "News + local reports",
      },
      geometry: { type: "Point", coordinates: [75.86, 30.9] },
    },
    {
      type: "Feature",
      properties: {
        title: "Airstrip maintenance spike",
        severity: "low",
        source: "Regional news",
      },
      geometry: { type: "Point", coordinates: [78.48, 17.38] },
    },
  ],
};

export const threatFeed: ThreatFeedItem[] = [
  {
    id: "feed-1",
    title: "POI Alpha changed travel corridor in <24h",
    summary:
      "Route deviated from routine procurement path and intersected two flagged logistics hubs.",
    timestamp: "11:12 IST",
    source: "News + mobility enrichment",
    locationLabel: "Karachi Corridor",
    coordinates: [67.21, 25.27],
    severity: "high",
    view: "poi",
  },
  {
    id: "feed-2",
    title: "Cross-border narrative spike around energy assets",
    summary:
      "Coordinated social narratives increased by 47% around strategic fuel sites in western India.",
    timestamp: "10:48 IST",
    source: "Social API stream",
    locationLabel: "Jodhpur Sector",
    coordinates: [73.02, 26.24],
    severity: "medium",
    view: "country",
  },
  {
    id: "feed-3",
    title: "Bilateral cargo-air pattern deviates from baseline",
    summary:
      "Three consecutive flights showed abnormal turnaround and unusual waypoint usage.",
    timestamp: "09:35 IST",
    source: "ADS-B + NOTAM parser",
    locationLabel: "Bay of Bengal Arc",
    coordinates: [89.9, 19.6],
    severity: "high",
    view: "bilateral",
  },
  {
    id: "feed-4",
    title: "New media cluster links to prior procurement storyline",
    summary:
      "Cross-source corroboration indicates continued reporting cadence from previously low-trust outlets.",
    timestamp: "08:51 IST",
    source: "GDELT + scraper layer",
    locationLabel: "Lahore Region",
    coordinates: [74.35, 31.52],
    severity: "low",
    view: "poi",
  },
];
