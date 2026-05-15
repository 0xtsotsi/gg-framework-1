#!/usr/bin/env bun

/**
 * gg-twenty CLI
 * Run with: bun run src/cli.ts
 * Or after build: node dist/cli.js
 */

import { GGTwentyEventLoop } from "./event-loop.js";
import type { GGTwentyConfig, TwentyModule } from "./twenty/types.js";
import { setLogLevel } from "./twenty/logger.js";

// ── Config from Environment ────────────────────────────────

const TWENTY_MCP_URL = process.env.TWENTY_MCP_URL ?? "http://localhost:3005/mcp";
const TWENTY_AUTH_TOKEN = process.env.TWENTY_AUTH_TOKEN ?? "";
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY ?? "";
const OPENROUTER_BASE_URL = process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1";
const COMPOSIO_API_KEY = process.env.COMPOSIO_API_KEY;
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS ?? "30000", 10);
const MODEL = process.env.MODEL ?? "openrouter/anthropic/claude-3-5-sonnet-latest";
const FAST_MODEL = process.env.FAST_MODEL ?? "openrouter/openai/gpt-4o-mini";
const LOG_LEVEL = (process.env.LOG_LEVEL ?? "info") as "debug" | "info" | "warn";
const ENABLED_MODULES = (process.env.ENABLED_MODULES ?? "note,task,company,person")
  .split(",")
  .map((m) => m.trim()) as TwentyModule[];

// ── Validate ──────────────────────────────────────────────

function validate(): boolean {
  if (!TWENTY_AUTH_TOKEN) {
    console.error("❌ TWENTY_AUTH_TOKEN is required");
    console.error("   Get it from: http://localhost:3005/settings/developers");
    return false;
  }
  if (!OPENROUTER_API_KEY) {
    console.error("❌ OPENROUTER_API_KEY is required");
    console.error("   Get it from: https://openrouter.ai/keys");
    return false;
  }
  return true;
}

// ── Print Banner ───────────────────────────────────────────

function printBanner(): void {
  console.log(`
╔═══════════════════════════════════════════════╗
║           gg-twenty — Event Loop              ║
║   Twenty CRM × ggcoder × CompoS               ║
╚═══════════════════════════════════════════════╝
  `);
}

function printConfig(): void {
  console.log("Config:");
  console.log(`  Twenty MCP:    ${TWENTY_MCP_URL}`);
  console.log(`  OpenRouter:    ${OPENROUTER_BASE_URL}`);
  console.log(`  Model:         ${MODEL}`);
  console.log(`  Fast Model:    ${FAST_MODEL}`);
  console.log(`  Poll Interval: ${POLL_INTERVAL_MS}ms`);
  console.log(`  Modules:       ${ENABLED_MODULES.join(", ")}`);
  console.log(`  CompoS:        ${COMPOSIO_API_KEY ? "enabled" : "disabled"}`);
  console.log("");
}

// ── Main ───────────────────────────────────────────────────

async function main(): Promise<void> {
  printBanner();

  if (!validate()) {
    process.exit(1);
  }

  setLogLevel(LOG_LEVEL);
  printConfig();

  const config: GGTwentyConfig = {
    twentyMcpUrl: TWENTY_MCP_URL,
    twentyAuthToken: TWENTY_AUTH_TOKEN,
    openRouterApiKey: OPENROUTER_API_KEY,
    openRouterBaseUrl: OPENROUTER_BASE_URL,
    model: MODEL,
    fastModel: FAST_MODEL,
    pollingIntervalMs: POLL_INTERVAL_MS,
    enabledModules: ENABLED_MODULES,
    composioApiKey: COMPOSIO_API_KEY,
    logLevel: LOG_LEVEL,
  };

  const loop = new GGTwentyEventLoop(config);

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received — shutting down...`);
    await loop.stop();
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  try {
    await loop.start();

    // Keep alive
    console.log("🟢 gg-twenty running. Press Ctrl+C to stop.\n");

    // Interactive commands
    const rl = await import("readline").then((m) =>
      m.createInterface({ input: process.stdin, output: process.stdout, terminal: false }),
    );

    rl.on("line", async (line: string) => {
      const cmd = line.trim().toLowerCase();
      if (cmd === "poll") {
        await loop.pollOnce();
        console.log("✅ Manual poll complete");
      } else if (cmd === "stats") {
        const s = loop.getStats();
        console.log(
          `📊 Stats: ${s.eventsProcessed} events | ${s.pollsCompleted} polls | uptime ${s.uptimeSeconds}s`,
        );
        if (s.lastResponse) {
          console.log(
            `   Last: ${s.lastResponse.module}/${s.lastResponse.action} → ${s.lastResponse.summary?.slice(0, 80) ?? "no summary"}...`,
          );
        }
      } else if (cmd === "status") {
        const twenty = loop.getTwentyClient();
        console.log(`🔗 Twenty MCP: ${twenty.isConnected() ? "connected" : "disconnected"}`);
        console.log(`   Tools: ${twenty.getTools().length}`);
      } else if (cmd === "help") {
        console.log("Commands: poll | stats | status | help | quit");
      } else if (cmd === "quit" || cmd === "exit") {
        await shutdown("quit");
      } else if (cmd !== "") {
        console.log(`Unknown command: ${cmd}. Try "help"`);
      }
    });
  } catch (err) {
    console.error("❌ Failed to start:", err);
    await loop.stop();
    process.exit(1);
  }
}

main();
