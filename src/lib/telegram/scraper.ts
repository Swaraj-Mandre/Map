import "server-only";

import path from "node:path";
import { spawn } from "node:child_process";

import type { ScrapedTelegramMessage } from "@/lib/telegram/types";

type ScraperOutput = {
  messages: ScrapedTelegramMessage[];
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
      reject(new Error("telegram fetch process timed out"));
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
              `telegram fetch exited with code ${code}`,
          ),
        );
        return;
      }
      resolve(stdout);
    });
  });
}

export async function runTelegramScraper(): Promise<ScrapedTelegramMessage[]> {
  const pythonCommand = process.env.TELEGRAM_PYTHON || "python";
  const timeoutMs = Number(process.env.TELEGRAM_TIMEOUT_MS ?? 120000);
  const scriptPath =
    process.env.TELEGRAM_SCRIPT ||
    path.join(process.cwd(), "scripts", "telegram", "fetch_latest.py");

  const output = await runProcess(pythonCommand, [scriptPath], timeoutMs);
  const parsed = JSON.parse(output) as ScraperOutput;
  if (!parsed || !Array.isArray(parsed.messages)) {
    throw new Error("Invalid telegram output. Expected JSON with a messages array.");
  }
  return parsed.messages;
}
