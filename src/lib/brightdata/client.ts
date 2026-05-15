import "server-only";

type TriggerResponse = {
  snapshot_id?: string;
  snapshotId?: string;
  id?: string;
};

type BrightDataConfig = {
  token: string;
  datasetId: string;
  profileUrls: string[];
  scrapeEndpoint: string;
  discoveryType: string;
};

export type BrightDataScrapeResult = {
  rawResponse: unknown;
  rows: unknown[];
};

function normalizeDiscoveryType(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "profile_url_most_recent_posts";
  }

  let candidate = trimmed;

  try {
    const url = new URL(trimmed);
    const pathParts = url.pathname.split("/").filter(Boolean);
    const configurationIndex = pathParts.lastIndexOf("configuration");

    if (configurationIndex > 0) {
      candidate = pathParts[configurationIndex - 1] ?? candidate;
    } else if (pathParts.length > 0) {
      candidate = pathParts[pathParts.length - 1] ?? candidate;
    }
  } catch {
    // Keep the original value when it is already a slug.
  }

  const normalized = candidate.toLowerCase().replace(/\s+/g, "_");

  if (
    normalized === "discover_by_profile_url_most_recent_posts" ||
    normalized === "profile_url_most_recent_posts"
  ) {
    return "profile_url_most_recent_posts";
  }

  return normalized;
}

function getRequiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing ${key}. Add it to .env.local.`);
  }
  return value;
}

function parseProfileUrls(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function getConfig(): BrightDataConfig {
  const profileUrls = parseProfileUrls(getRequiredEnv("BRIGHTDATA_PROFILE_URLS"));
  if (profileUrls.length === 0) {
    throw new Error("BRIGHTDATA_PROFILE_URLS must include at least one URL.");
  }
  const datasetId = getRequiredEnv("BRIGHTDATA_DATASET_ID");
  return {
    token: getRequiredEnv("BRIGHTDATA_API_TOKEN"),
    datasetId,
    profileUrls,
    scrapeEndpoint:
      process.env.BRIGHTDATA_TRIGGER_ENDPOINT ??
      `https://api.brightdata.com/datasets/v3/scrape?dataset_id=${encodeURIComponent(datasetId)}&notify=false&include_errors=true&type=discover_new&discover_by=profile_url_most_recent_posts`,
    discoveryType:
      process.env.BRIGHTDATA_DISCOVERY_TYPE ??
      "profile_url_most_recent_posts",
  };
}

function extractRows(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  const record = payload as Record<string, unknown>;
  const candidateKeys = ["data", "results", "result", "items", "posts", "output"];

  for (const key of candidateKeys) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value;
    }
  }

  const nestedArrays = Object.values(record).filter(Array.isArray) as unknown[][];
  return nestedArrays[0] ?? [];
}

function formatBrightDataError(message: string): string {
  const normalized = message.toLowerCase();
  if (normalized.includes("customer is not active")) {
    return "Bright Data customer is not active. Confirm the API token belongs to the active account and the dataset is enabled for that account.";
  }

  return message;
}

export async function runBrightDataScraper(): Promise<BrightDataScrapeResult> {
  const config = getConfig();
  const url = new URL(config.scrapeEndpoint);
  if (!url.searchParams.has("dataset_id")) {
    url.searchParams.set("dataset_id", config.datasetId);
  }
  if (!url.searchParams.has("notify")) {
    url.searchParams.set("notify", "false");
  }
  if (!url.searchParams.has("include_errors")) {
    url.searchParams.set("include_errors", "true");
  }
  if (!url.searchParams.has("type")) {
    url.searchParams.set("type", "discover_new");
  }
  if (!url.searchParams.has("discover_by")) {
    url.searchParams.set("discover_by", normalizeDiscoveryType(config.discoveryType));
  }

  const requestBody = {
    input: config.profileUrls.map((profileUrl) => ({
      url: profileUrl,
      start_date: "",
      end_date: "",
    })),
  };

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(formatBrightDataError(text || "Bright Data trigger failed."));
  }

  const payload = (await response.json()) as unknown;
  return {
    rawResponse: payload,
    rows: extractRows(payload),
  };
}
