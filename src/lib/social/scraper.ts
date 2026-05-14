import "server-only";

import path from "node:path";
import { spawn } from "node:child_process";

import type { ScrapedSocialTweet } from "@/lib/social/types";

type ScraperOutput = {
  tweets: ScrapedSocialTweet[];
  errors?: string[];
};

function runProcess(command: string, args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("twscrape process timed out"));
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf-8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf-8");
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(
          new Error(
            stderr.trim() ||
              stdout.trim() ||
              `twscrape process exited with code ${code}`,
          ),
        );
        return;
      }
      resolve(stdout);
    });
  });
}

export async function runSocialScraper(): Promise<ScrapedSocialTweet[]> {
  const pythonCommand = process.env.TWITTER_SCRAPER_PYTHON || "python";
  const timeoutMs = Number(process.env.TWITTER_SCRAPER_TIMEOUT_MS ?? 120000);
  const scriptPath =
    process.env.TWITTER_SCRAPER_SCRIPT ||
    path.join(process.cwd(), "scripts", "social", "twscrape_fetch.py");

  const output = await runProcess(pythonCommand, [scriptPath], timeoutMs);
  const parsed = JSON.parse(output) as ScraperOutput;
  if (!parsed || !Array.isArray(parsed.tweets)) {
    throw new Error("Invalid scraper output. Expected JSON with a tweets array.");
  }
  return parsed.tweets;
}
