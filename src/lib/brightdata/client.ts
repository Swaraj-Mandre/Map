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
  triggerEndpoint: string;
  downloadEndpoint: string;
  timeoutMs: number;
  pollIntervalMs: number;
};

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
  return {
    token: getRequiredEnv("BRIGHTDATA_API_TOKEN"),
    datasetId: getRequiredEnv("BRIGHTDATA_DATASET_ID"),
    profileUrls,
    triggerEndpoint:
      process.env.BRIGHTDATA_TRIGGER_ENDPOINT ??
      "https://api.brightdata.com/datasets/v3/trigger",
    downloadEndpoint:
      process.env.BRIGHTDATA_DOWNLOAD_ENDPOINT ??
      "https://api.brightdata.com/datasets/v3/snapshots/{snapshot_id}/download",
    timeoutMs: Number(process.env.BRIGHTDATA_TIMEOUT_MS ?? 420000),
    pollIntervalMs: Number(process.env.BRIGHTDATA_POLL_INTERVAL_MS ?? 10000),
  };
}

function toSnapshotId(payload: TriggerResponse): string | null {
  return payload.snapshot_id ?? payload.snapshotId ?? payload.id ?? null;
}

async function triggerSnapshot(config: BrightDataConfig): Promise<string> {
  const url = new URL(config.triggerEndpoint);
  url.searchParams.set("dataset_id", config.datasetId);
  const payload = {
    input: config.profileUrls.map((profileUrl) => ({ url: profileUrl })),
  };

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Bright Data trigger failed.");
  }

  const payload = (await response.json()) as TriggerResponse;
  const snapshotId = toSnapshotId(payload);
  if (!snapshotId) {
    throw new Error("Bright Data trigger did not return a snapshot_id.");
  }
  return snapshotId;
}

async function downloadSnapshot(
  config: BrightDataConfig,
  snapshotId: string,
): Promise<unknown[]> {
  const url = config.downloadEndpoint.replace("{snapshot_id}", snapshotId);
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${config.token}`,
      Accept: "application/json",
    },
  });

  if (response.status === 202 || response.status === 404) {
    return [];
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Bright Data download failed.");
  }

  return (await response.json()) as unknown[];
}

export async function runBrightDataScraper(): Promise<unknown[]> {
  const config = getConfig();
  const snapshotId = await triggerSnapshot(config);
  const startedAt = Date.now();

  while (Date.now() - startedAt < config.timeoutMs) {
    const data = await downloadSnapshot(config, snapshotId);
    if (data.length > 0) {
      return data;
    }
    await new Promise((resolve) => setTimeout(resolve, config.pollIntervalMs));
  }

  throw new Error("Bright Data snapshot timed out.");
}
