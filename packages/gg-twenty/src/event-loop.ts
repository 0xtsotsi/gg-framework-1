/**
 * gg-twenty Event Loop
 * Main orchestrator that ties everything together:
 * 1. Connects to Twenty MCP
 * 2. Watches modules for new records via polling
 * 3. Dispatches events to agent handlers
 * 4. Logs everything back to Twenty as activities
 * 5. Persists state across restarts
 */

import { TwentyMCPClient } from "./twenty/client.js";
import { TwentyPollingEngine } from "./twenty/polling.js";
import { StateManager } from "./sync/state.js";
import { handleNoteEvent } from "./agent/note-handler.js";
import { handleTaskEvent } from "./agent/task-handler.js";
import { handleCompanyEvent } from "./agent/company-handler.js";
import { CompoSManager } from "./composio/composio.js";
import type { GGTwentyConfig, AgentResponse, TwentyModule } from "./twenty/types.js";
import { log, setLogLevel } from "./twenty/logger.js";

const DEFAULT_INTERVAL_MS = 30_000; // 30 seconds

export interface EventLoopStats {
  uptimeSeconds: number;
  pollsCompleted: number;
  eventsProcessed: number;
  responses: AgentResponse[];
  errors: string[];
  lastPollAt: string | null;
  lastResponse: AgentResponse | null;
}

export class GGTwentyEventLoop {
  private config: GGTwentyConfig;
  private twenty: TwentyMCPClient;
  private polling: TwentyPollingEngine;
  private state: StateManager;
  private composio: CompoSManager | null = null;
  private running = false;
  private startTime = 0;
  private stats: EventLoopStats;

  constructor(config: GGTwentyConfig) {
    this.config = config;

    if (config.logLevel) {
      setLogLevel(config.logLevel);
    }

    this.twenty = new TwentyMCPClient(config.twentyMcpUrl, config.twentyAuthToken);
    const modules =
      config.enabledModules ?? (["note", "task", "company", "person"] as TwentyModule[]);
    this.polling = new TwentyPollingEngine(
      this.twenty,
      modules,
      config.pollingIntervalMs ?? DEFAULT_INTERVAL_MS,
    );
    this.state = new StateManager();

    if (config.composioApiKey) {
      this.composio = new CompoSManager(config.composioApiKey);
      log("info", "loop", "CompoS enabled");
    }

    this.stats = {
      uptimeSeconds: 0,
      pollsCompleted: 0,
      eventsProcessed: 0,
      responses: [],
      errors: [],
      lastPollAt: null,
      lastResponse: null,
    };

    this.registerHandlers();
  }

  private registerHandlers(): void {
    // Note handler
    this.polling.on("note", async (event) => {
      const response = await handleNoteEvent(event, this.twenty, {
        openRouterApiKey: this.config.openRouterApiKey,
        openRouterBaseUrl: this.config.openRouterBaseUrl,
        model: this.config.model,
        fastModel: this.config.fastModel,
      });
      if (response) this.recordResponse(response);
    });

    // Task handler
    this.polling.on("task", async (event) => {
      const response = await handleTaskEvent(event, this.twenty, {
        openRouterApiKey: this.config.openRouterApiKey,
        openRouterBaseUrl: this.config.openRouterBaseUrl,
        model: this.config.model,
        fastModel: this.config.fastModel,
      });
      if (response) this.recordResponse(response);
    });

    // Company handler
    this.polling.on("company", async (event) => {
      const response = await handleCompanyEvent(event, this.twenty, {
        openRouterApiKey: this.config.openRouterApiKey,
        openRouterBaseUrl: this.config.openRouterBaseUrl,
        model: this.config.model,
        fastModel: this.config.fastModel,
      });
      if (response) this.recordResponse(response);
    });

    // Person handler (basic enrichment)
    this.polling.on("person", async (event) => {
      const record = event.record;
      const personId = String(record.id ?? "");
      const name = String(record.name ?? "Unknown");

      if (!name || name === "Unknown") return;

      log("info", "agent:person", `Processing person: ${name}`, { personId });

      // Light enrichment — post a greeting note if they have an email
      if (record.email) {
        await this.twenty.executeTool("execute_mcp_tool", {
          serviceName: "standard",
          toolName: "create_activity",
          args: {
            targetId: personId,
            content: `👋 Welcome! This person was just enriched by gg-twenty. ${record.jobTitle ? `Role: ${record.jobTitle}` : ""}`,
          },
        });
      }

      this.stats.eventsProcessed++;
    });
  }

  private recordResponse(response: AgentResponse): void {
    this.stats.eventsProcessed++;
    this.stats.lastResponse = response;
    this.stats.responses.push(response);
    if (this.stats.responses.length > 50) this.stats.responses.shift();
    this.state.addToAgentMemory(response.module, response.recordId);
  }

  private statsInterval: ReturnType<typeof setInterval> | null = null;

  async start(): Promise<void> {
    log("info", "loop", "Starting gg-twenty event loop...");
    log("info", "loop", `Twenty MCP: ${this.config.twentyMcpUrl}`);
    log("info", "loop", `Modules: ${this.config.enabledModules?.join(", ") ?? "all"}`);

    // Load persisted state
    const state = await this.state.load();
    this.polling.loadState(state);

    // Connect to Twenty MCP
    await this.twenty.connect();

    // Log connected tools
    const tools = this.twenty.getTools();
    log("info", "loop", `Twenty MCP tools: ${tools.map((t) => t.name).join(", ")}`);

    // Start polling
    this.startTime = Date.now();
    this.running = true;
    this.polling.start();

    // Periodic stat logging every 5 minutes
    this.statsInterval = setInterval(() => {
      this.stats.uptimeSeconds = Math.floor((Date.now() - this.startTime) / 1000);
      log(
        "info",
        "stats",
        `Uptime: ${this.stats.uptimeSeconds}s | Events: ${this.stats.eventsProcessed} | Polls: ${this.stats.pollsCompleted}`,
      );
    }, 300_000);

    log("info", "loop", "gg-twenty event loop started ✅");
  }

  async stop(): Promise<void> {
    log("info", "loop", "Stopping gg-twenty...");
    this.running = false;
    this.polling.stop();
    if (this.statsInterval) {
      clearInterval(this.statsInterval);
      this.statsInterval = null;
    }
    // Sync updated cursors from polling engine to state before saving
    const pollingState = this.polling.getState();
    for (const [module, cursor] of Object.entries(pollingState)) {
      this.state.updateCursor(module, cursor);
    }

    await this.twenty.disconnect();
    await this.state.save();
    log("info", "loop", "gg-twenty stopped");
  }

  getStats(): EventLoopStats {
    return {
      ...this.stats,
      uptimeSeconds: this.running
        ? Math.floor((Date.now() - this.startTime) / 1000)
        : this.stats.uptimeSeconds,
    };
  }

  async pollOnce(): Promise<void> {
    await this.polling.poll();
    this.stats.pollsCompleted++;
    this.stats.lastPollAt = new Date().toISOString();
  }

  getTwentyClient(): TwentyMCPClient {
    return this.twenty;
  }
}
