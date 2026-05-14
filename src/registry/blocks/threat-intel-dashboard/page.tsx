"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Layers3,
  MessageSquare,
  Send,
  Shield,
} from "lucide-react";

import {
  Map,
  MapArc,
  MapClusterLayer,
  MapControls,
  MapMarker,
  MapPopup,
  MapRoute,
  MarkerContent,
  MarkerLabel,
  MarkerTooltip,
  type MapRef,
  type MapViewport,
} from "@/registry/map";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { BrightDataPost, BrightDataReport } from "@/lib/brightdata/types";
import type { TelegramMessage, TelegramReport } from "@/lib/telegram/types";
import {
  bilateralArcs,
  indiaActivityPoints,
  poiTrails,
  threatFeed,
  type ThreatFeedItem,
  type ThreatSeverity,
} from "./data";

type DashboardView = "poi" | "country" | "bilateral";
type ProjectionMode = "globe" | "mercator";

type LayerState = {
  markers: boolean;
  movement: boolean;
  clusters: boolean;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

type UnifiedFeedItem = {
  id: string;
  source: "telegram" | "x";
  title: string;
  text: string;
  createdAt: string | null;
  url?: string | null;
  badgeLabel: string;
  isNew: boolean;
};

const defaultLayers: LayerState = {
  markers: true,
  movement: true,
  clusters: true,
};

const projectionLabels: Record<ProjectionMode, string> = {
  globe: "3D Globe",
  mercator: "2D Mercator",
};

const viewLabels: Record<DashboardView, string> = {
  poi: "POI Movements",
  country: "Country Activity",
  bilateral: "Bilateral Activity",
};

const severityClass: Record<ThreatSeverity, string> = {
  low: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  medium: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  high: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
};

const viewViewport: Record<DashboardView, Record<ProjectionMode, MapViewport>> = {
  poi: {
    globe: { center: [73.6, 23.5], zoom: 3.7, bearing: 0, pitch: 0 },
    mercator: { center: [72.4, 24.8], zoom: 4.2, bearing: 0, pitch: 0 },
  },
  country: {
    globe: { center: [80.6, 25.1], zoom: 3.9, bearing: 0, pitch: 0 },
    mercator: { center: [78.9, 22.8], zoom: 4.5, bearing: 0, pitch: 0 },
  },
  bilateral: {
    globe: { center: [87.9, 20.3], zoom: 3.5, bearing: 0, pitch: 0 },
    mercator: { center: [88.5, 19.1], zoom: 3.5, bearing: 0, pitch: 0 },
  },
};

const fitPadding = { top: 80, right: 80, bottom: 80, left: 80 };

function buildBounds(points: [number, number][]) {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;

  for (const [lng, lat] of points) {
    minLng = Math.min(minLng, lng);
    minLat = Math.min(minLat, lat);
    maxLng = Math.max(maxLng, lng);
    maxLat = Math.max(maxLat, lat);
  }

  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ] as [[number, number], [number, number]];
}

function getBoundsForView(view: DashboardView) {
  if (view === "poi") {
    const points = poiTrails.flatMap((trail) => trail.path);
    return buildBounds(points);
  }
  if (view === "country") {
    const points = indiaActivityPoints.features.map(
      (feature) => feature.geometry.coordinates as [number, number],
    );
    return buildBounds(points);
  }

  const points = bilateralArcs.flatMap((arc) => [arc.from, arc.to]);
  return buildBounds(points);
}

function getSeverityScore(severity: ThreatSeverity) {
  if (severity === "high") return 0.86;
  if (severity === "medium") return 0.67;
  return 0.48;
}

function createAssistantReply(
  view: DashboardView,
  prompt: string,
  feed: ThreatFeedItem,
) {
  return `Deep-dive for ${viewLabels[view]}: Based on "${feed.title}", confidence is ${(getSeverityScore(feed.severity) * 100).toFixed(0)}%. Primary signal source: ${feed.source}. Analyst query received: "${prompt}". Recommended next step: compare this event against the last 72h timeline and escalate if source corroboration rises above 3 independent channels.`;
}

function getPoiFeedForTrail(trailId: string) {
  if (trailId === "poi-1") return threatFeed.find((item) => item.id === "feed-1");
  if (trailId === "poi-2") return threatFeed.find((item) => item.id === "feed-4");
  if (trailId === "poi-3") return threatFeed.find((item) => item.view === "poi");
  return threatFeed.find((item) => item.view === "poi");
}

function formatUnifiedTimestamp(value: string | null) {
  if (!value) return "Unknown time";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleString();
}

export default function Page() {
  const [view, setView] = useState<DashboardView>("poi");
  const [projection, setProjection] = useState<ProjectionMode>("globe");
  const [layers, setLayers] = useState<LayerState>(defaultLayers);
  const [selectedFeed, setSelectedFeed] = useState<ThreatFeedItem | null>(null);
  const mapRef = useRef<MapRef | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "m-0",
      role: "assistant",
      text: "I can summarize threats, compare locations, and explain confidence scoring from current map signals.",
    },
  ]);
  const [viewport, setViewport] = useState<MapViewport>(viewViewport.poi.globe);
  const [telegramReport, setTelegramReport] = useState<TelegramReport | null>(null);
  const [telegramFeed, setTelegramFeed] = useState<TelegramMessage[]>([]);
  const [telegramLoading, setTelegramLoading] = useState(true);
  const [telegramRefreshing, setTelegramRefreshing] = useState(false);
  const [telegramError, setTelegramError] = useState<string | null>(null);
  const [brightDataReport, setBrightDataReport] = useState<BrightDataReport | null>(null);
  const [brightDataFeed, setBrightDataFeed] = useState<BrightDataPost[]>([]);
  const [brightDataLoading, setBrightDataLoading] = useState(true);
  const [brightDataRefreshing, setBrightDataRefreshing] = useState(false);
  const [brightDataError, setBrightDataError] = useState<string | null>(null);

  const filteredFeed = useMemo(
    () => threatFeed.filter((item) => item.view === view),
    [view],
  );

  const bilateralMarkers = useMemo(
    () =>
      bilateralArcs.flatMap((arc) => [
        {
          id: `${arc.id}-from`,
          label: arc.fromLabel,
          coordinates: arc.from,
        },
        {
          id: `${arc.id}-to`,
          label: arc.toLabel,
          coordinates: arc.to,
        },
      ]),
    [],
  );

  const switchView = (nextView: DashboardView) => {
    setView(nextView);
    setSelectedFeed(null);
    const map = mapRef.current;
    if (map) {
      const bounds = getBoundsForView(nextView);
      map.fitBounds(bounds, {
        padding: fitPadding,
        duration: 1200,
        bearing: 0,
        pitch: 0,
        maxZoom: projection === "globe" ? 5 : 8,
      });
      return;
    }

    setViewport(viewViewport[nextView][projection]);
  };

  const switchProjection = (nextProjection: ProjectionMode) => {
    setProjection(nextProjection);
    setViewport(viewViewport[view][nextProjection]);
  };

  const toggleLayer = (layer: keyof LayerState) => {
    setLayers((prev) => ({ ...prev, [layer]: !prev[layer] }));
  };

  const onChatSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const prompt = chatInput.trim();
    if (!prompt) return;

    const activeFeed = selectedFeed ?? filteredFeed[0] ?? threatFeed[0];
    const userMessage: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      text: prompt,
    };

    const assistantMessage: ChatMessage = {
      id: `a-${Date.now()}`,
      role: "assistant",
      text: createAssistantReply(view, prompt, activeFeed),
    };

    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    setChatInput("");
  };

  const loadTelegramReport = async () => {
    setTelegramLoading(true);
    setTelegramError(null);
    try {
      const response = await fetch("/api/telegram/report", {
        method: "GET",
        cache: "no-store",
      });
      const payload = (await response.json()) as TelegramReport;
      setTelegramReport(payload);
      setTelegramFeed(payload.messages ?? []);
      if (!response.ok && payload.errors.length > 0) {
        setTelegramError(payload.errors.join(" | "));
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not load Telegram feed.";
      setTelegramError(message);
    } finally {
      setTelegramLoading(false);
    }
  };

  const refreshTelegramReport = async () => {
    setTelegramRefreshing(true);
    setTelegramError(null);
    try {
      const response = await fetch("/api/telegram/refresh", { method: "POST" });
      const payload = (await response.json()) as TelegramReport;
      setTelegramReport(payload);
      setTelegramFeed(payload.messages ?? []);
      if (!response.ok) {
        setTelegramError(payload.errors.join(" | ") || "Telegram refresh failed.");
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Telegram refresh failed.";
      setTelegramError(message);
    } finally {
      setTelegramRefreshing(false);
    }
  };

  const loadBrightDataReport = async () => {
    setBrightDataLoading(true);
    setBrightDataError(null);
    try {
      const response = await fetch("/api/brightdata/report", {
        method: "GET",
        cache: "no-store",
      });
      const payload = (await response.json()) as BrightDataReport;
      setBrightDataReport(payload);
      setBrightDataFeed(payload.posts ?? []);
      if (!response.ok) {
        setBrightDataError(payload.errors.join(" | ") || "Bright Data fetch failed.");
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Bright Data fetch failed.";
      setBrightDataError(message);
    } finally {
      setBrightDataLoading(false);
    }
  };

  const refreshBrightDataReport = async () => {
    setBrightDataRefreshing(true);
    setBrightDataError(null);
    try {
      const response = await fetch("/api/brightdata/refresh", {
        method: "POST",
      });
      const payload = (await response.json()) as BrightDataReport;
      setBrightDataReport(payload);
      setBrightDataFeed(payload.posts ?? []);
      if (!response.ok) {
        setBrightDataError(payload.errors.join(" | ") || "Bright Data refresh failed.");
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Bright Data refresh failed.";
      setBrightDataError(message);
    } finally {
      setBrightDataRefreshing(false);
    }
  };

  useEffect(() => {
    void loadTelegramReport();
    void loadBrightDataReport();
  }, []);

  const unifiedFeed = useMemo(() => {
    const telegramItems: UnifiedFeedItem[] = telegramFeed.map((message) => ({
      id: message.id,
      source: "telegram",
      title: message.channelTitle,
      text: message.text,
      createdAt: message.createdAt,
      url: message.url,
      badgeLabel: message.channelTitle,
      isNew: message.isNew,
    }));

    const xItems: UnifiedFeedItem[] = brightDataFeed.map((post, index) => ({
      id: post.id ?? `x-${index}`,
      source: "x",
      title: post.authorName || post.authorUsername || "X post",
      text: post.text,
      createdAt: post.createdAt,
      url: post.url ?? null,
      badgeLabel: post.authorUsername ? `@${post.authorUsername}` : "X",
      isNew: post.isNew,
    }));

    return [...telegramItems, ...xItems].sort((a, b) => {
      const aTime = a.createdAt ? Date.parse(a.createdAt) : 0;
      const bTime = b.createdAt ? Date.parse(b.createdAt) : 0;
      return bTime - aTime;
    });
  }, [brightDataFeed, telegramFeed]);

  return (
    <div className="bg-background min-h-screen p-4 md:p-6">
      <div className="grid h-[calc(100vh-2rem)] w-full gap-4 px-0 lg:grid-cols-[1.5fr_1fr]">
        <Card className="flex flex-col overflow-hidden py-0">
          <CardHeader className="border-border/70 border-b py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Shield className="size-4" />
                Interactive Geospatial Threat Dashboard
              </CardTitle>

              <div className="flex flex-wrap items-center gap-2">
                {(Object.keys(projectionLabels) as ProjectionMode[]).map((key) => (
                  <Button
                    key={key}
                    variant={projection === key ? "default" : "outline"}
                    size="sm"
                    onClick={() => switchProjection(key)}
                  >
                    {projectionLabels[key]}
                  </Button>
                ))}
              </div>
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Tabs
                value={view}
                onValueChange={(value) => switchView(value as DashboardView)}
              >
                <TabsList>
                  <TabsTrigger value="poi">POI Movements</TabsTrigger>
                  <TabsTrigger value="country">Country Activity</TabsTrigger>
                  <TabsTrigger value="bilateral">Bilateral Activity</TabsTrigger>
                </TabsList>
              </Tabs>

              <div className="ml-auto flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant={layers.markers ? "default" : "outline"}
                  onClick={() => toggleLayer("markers")}
                >
                  Markers
                </Button>
                <Button
                  size="sm"
                  variant={layers.movement ? "default" : "outline"}
                  onClick={() => toggleLayer("movement")}
                >
                  Routes & Arcs
                </Button>
                <Button
                  size="sm"
                  variant={layers.clusters ? "default" : "outline"}
                  onClick={() => toggleLayer("clusters")}
                >
                  Clusters
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="relative min-h-0 flex-1 p-0">
            <Map
              ref={mapRef}
              className="h-full w-full"
              projection={{ type: projection }}
              viewport={viewport}
              onViewportChange={setViewport}
              minZoom={2}
              maxZoom={8}
            >
              <MapControls showCompass showFullscreen />

              {view === "poi" && layers.movement
                ? poiTrails.map((trail) => (
                    <MapRoute
                      key={trail.id}
                      id={`route-${trail.id}`}
                      coordinates={trail.path}
                      color={trail.color}
                      width={4}
                      opacity={0.84}
                      onMouseEnter={() => {
                        const feedItem = getPoiFeedForTrail(trail.id);
                        if (feedItem) {
                          setSelectedFeed(feedItem);
                        }
                      }}
                      onMouseLeave={() => setSelectedFeed(null)}
                    />
                  ))
                : null}

              {view === "poi" && layers.markers
                ? poiTrails.map((trail) => {
                    const current = trail.path[trail.path.length - 1];
                    return (
                      <MapMarker
                        key={`marker-${trail.id}`}
                        longitude={current[0]}
                        latitude={current[1]}
                      >
                        <MarkerContent>
                          <div
                            className="size-3 rounded-full border-2 border-white shadow-md"
                            style={{ backgroundColor: trail.color }}
                          />
                          <MarkerLabel className="bg-background/85 rounded px-1.5 py-0.5 text-[10px] backdrop-blur">
                            {trail.label}
                          </MarkerLabel>
                        </MarkerContent>
                        <MarkerTooltip className="bg-background text-foreground border">
                          <p className="font-medium">{trail.label}</p>
                          <p className="text-muted-foreground">{trail.role}</p>
                        </MarkerTooltip>
                      </MapMarker>
                    );
                  })
                : null}

              {view === "country" && layers.clusters ? (
                <MapClusterLayer
                  data={indiaActivityPoints}
                  clusterRadius={42}
                  clusterThresholds={[4, 8]}
                  clusterColors={["#22c55e", "#eab308", "#ef4444"]}
                  pointColor="#3b82f6"
                />
              ) : null}

              {view === "country" && layers.markers
                ? indiaActivityPoints.features.map((feature, index) => (
                    <MapMarker
                      key={`country-point-${index}`}
                      longitude={feature.geometry.coordinates[0]}
                      latitude={feature.geometry.coordinates[1]}
                    >
                      <MarkerContent>
                        <div className="size-3 rounded-full border-2 border-white bg-blue-500 shadow-md" />
                      </MarkerContent>
                      <MarkerTooltip className="bg-background text-foreground border">
                        <p className="font-medium">{feature.properties.title}</p>
                        <p className="text-muted-foreground">
                          {feature.properties.source}
                        </p>
                      </MarkerTooltip>
                    </MapMarker>
                  ))
                : null}

              {view === "bilateral" && layers.movement ? (
                <MapArc
                  data={bilateralArcs.map((arc) => ({
                    id: arc.id,
                    from: arc.from,
                    to: arc.to,
                    intensity: arc.intensity,
                  }))}
                  curvature={0.22}
                  paint={{
                    "line-color": [
                      "interpolate",
                      ["linear"],
                      ["get", "intensity"],
                      0.5,
                      "#60a5fa",
                      0.9,
                      "#ef4444",
                    ],
                    "line-width": [
                      "interpolate",
                      ["linear"],
                      ["get", "intensity"],
                      0.5,
                      2,
                      0.9,
                      5,
                    ],
                    "line-opacity": 0.82,
                  }}
                  hoverPaint={{ "line-opacity": 1 }}
                />
              ) : null}

              {view === "bilateral" && layers.markers
                ? bilateralMarkers.map((marker) => (
                    <MapMarker
                      key={marker.id}
                      longitude={marker.coordinates[0]}
                      latitude={marker.coordinates[1]}
                    >
                      <MarkerContent>
                        <div className="size-3 rounded-full border-2 border-white bg-violet-500 shadow-md" />
                        <MarkerLabel className="bg-background/85 rounded px-1.5 py-0.5 text-[10px] backdrop-blur">
                          {marker.label}
                        </MarkerLabel>
                      </MarkerContent>
                    </MapMarker>
                  ))
                : null}

              {selectedFeed ? (
                <MapPopup
                  longitude={selectedFeed.coordinates[0]}
                  latitude={selectedFeed.coordinates[1]}
                  closeButton
                  onClose={() => setSelectedFeed(null)}
                >
                  <p className="text-sm font-semibold">{selectedFeed.title}</p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {selectedFeed.summary}
                  </p>
                </MapPopup>
              ) : null}
            </Map>

            <div className="border-border/70 bg-background/85 absolute top-3 left-3 z-10 rounded-md border px-2.5 py-1.5 text-xs backdrop-blur">
              <p className="font-medium">{viewLabels[view]}</p>
              <p className="text-muted-foreground">
                Layers:{" "}
                {Object.entries(layers)
                  .filter(([, enabled]) => enabled)
                  .map(([name]) => name)
                  .join(", ")}
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-rows-[1fr_1fr]">
          <Card className="py-0">
            <CardHeader className="border-border/70 border-b py-3">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Layers3 className="size-4" />
                  Threat Feed
                </CardTitle>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground inline-flex size-6 items-center justify-center rounded-sm border text-[10px] font-semibold transition-colors"
                    onClick={refreshTelegramReport}
                    disabled={telegramRefreshing}
                    aria-label="Refresh telegram feed"
                    title="Refresh telegram feed"
                  >
                    <span className={telegramRefreshing ? "animate-spin" : ""}>↺</span>
                  </button>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground inline-flex size-6 items-center justify-center rounded-sm border text-[10px] font-semibold transition-colors"
                    onClick={refreshBrightDataReport}
                    disabled={brightDataRefreshing}
                    aria-label="Refresh X feed"
                    title="Refresh X feed"
                  >
                    X
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 p-3 max-h-[360px] overflow-y-auto pr-2">
              {telegramLoading || brightDataLoading ? (
                <p className="text-muted-foreground text-xs">
                  Loading threat feed updates...
                </p>
              ) : null}
              {telegramError ? (
                <p className="text-xs text-rose-500">{telegramError}</p>
              ) : null}
              {brightDataError ? (
                <p className="text-xs text-rose-500">{brightDataError}</p>
              ) : null}
              {!telegramLoading &&
              !brightDataLoading &&
              unifiedFeed.length === 0 ? (
                <p className="text-muted-foreground text-xs">
                  No threat feed updates yet. Click refresh to fetch.
                </p>
              ) : null}
              {unifiedFeed.map((item) => (
                <a
                  key={item.id}
                  href={item.url ?? "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:bg-muted/70 block rounded-md border p-3 text-left transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <Badge
                      className={
                        item.source === "telegram"
                          ? severityClass.high
                          : severityClass.medium
                      }
                      variant="secondary"
                    >
                      {item.badgeLabel}
                    </Badge>
                    <span className="text-muted-foreground text-xs">
                      {formatUnifiedTimestamp(item.createdAt)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-medium line-clamp-2">{item.text}</p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {item.source === "telegram" ? "Telegram" : "X (Bright Data)"}
                    {item.isNew ? " • New" : ""}
                  </p>
                </a>
              ))}
            </CardContent>
          </Card>

          <Card className="py-0">
            <CardHeader className="border-border/70 border-b py-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <MessageSquare className="size-4" />
                LLM Deep-Dive Chat
              </CardTitle>
            </CardHeader>
            <CardContent className="flex h-full flex-col gap-3 p-3">
              <div className="bg-muted/30 min-h-0 flex-1 space-y-2 overflow-y-auto rounded-md border p-2.5">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={
                      message.role === "user"
                        ? "ml-auto max-w-[92%] rounded-md bg-blue-500 px-2.5 py-2 text-xs text-white"
                        : "max-w-[92%] rounded-md border bg-card px-2.5 py-2 text-xs"
                    }
                  >
                    {message.text}
                  </div>
                ))}
              </div>

              <form onSubmit={onChatSubmit} className="flex items-center gap-2">
                <Input
                  value={chatInput}
                  onChange={(event) => setChatInput(event.target.value)}
                  placeholder="Ask: Why is this event high confidence?"
                />
                <Button type="submit" size="sm">
                  <Send className="size-4" />
                </Button>
              </form>

              <div className="text-muted-foreground flex items-start gap-1.5 text-xs">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                Confidence scoring shown in chat is a demo blend of source trust,
                corroboration, and narrative alignment.
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
