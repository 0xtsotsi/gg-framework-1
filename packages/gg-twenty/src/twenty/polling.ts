/**
 * Polling engine for Twenty modules.
 * Watches for new/updated records and emits events.
 */

import type { TwentyMCPClient } from "./client.js";
import type { TwentyModule, TwentyEvent, ModuleCursor } from "./types.js";
import { log } from "./logger.js";
import type { SyncState } from "./types.js";

// Maps Twenty module names → MCP object names
const MODULE_MAP: Record<TwentyModule, string> = {
  note: "note",
  task: "task",
  company: "company",
  person: "person",
  calendarEvent: "calendarEvent",
  opportunity: "opportunity",
  workflow: "workflow",
};

const POLL_DEFAULTS: Record<TwentyModule, { limit: number; orderBy: Record<string, string> }> = {
  note: { limit: 5, orderBy: { createdAt: "DescNullsFirst" } },
  task: { limit: 5, orderBy: { createdAt: "DescNullsFirst" } },
  company: { limit: 5, orderBy: { createdAt: "DescNullsFirst" } },
  person: { limit: 5, orderBy: { createdAt: "DescNullsFirst" } },
  calendarEvent: { limit: 5, orderBy: { startsAt: "DescNullsFirst" } },
  opportunity: { limit: 5, orderBy: { createdAt: "DescNullsFirst" } },
  workflow: { limit: 5, orderBy: { createdAt: "DescNullsFirst" } },
};

export type PollHandler = (event: TwentyEvent) => void | Promise<void>;

export class TwentyPollingEngine {
  private twenty: TwentyMCPClient;
  private handlers: Map<TwentyModule, PollHandler[]> = new Map();
  private cursors: Map<TwentyModule, ModuleCursor> = new Map();
  private intervalMs: number;
  private running = false;
  private polling = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private activeModules: TwentyModule[];

  constructor(twenty: TwentyMCPClient, modules: TwentyModule[], intervalMs = 30_000) {
    this.twenty = twenty;
    this.activeModules = modules;
    this.intervalMs = intervalMs;

    for (const mod of modules) {
      this.cursors.set(mod, {
        module: mod,
        lastCursor: null,
        lastPolledAt: new Date(0).toISOString(),
        processedCount: 0,
      });
      this.handlers.set(mod, []);
    }
  }

  /**
   * Register a handler for a specific module's events.
   */
  on(module: TwentyModule, handler: PollHandler): void {
    this.handlers.get(module)?.push(handler);
  }

  /**
   * Load cursors from persisted state.
   */
  loadState(state: SyncState): void {
    for (const [module, cursor] of Object.entries(state.cursors)) {
      if (this.activeModules.includes(module as TwentyModule)) {
        this.cursors.set(module as TwentyModule, cursor);
      }
    }
  }

  /**
   * Get current cursors for state persistence.
   */
  getState(): Record<string, ModuleCursor> {
    const result: Record<string, ModuleCursor> = {};
    for (const [mod, cursor] of this.cursors) {
      result[mod] = cursor;
    }
    return result;
  }

  /**
   * Start the polling loop.
   */
  start(): void {
    if (this.running) return;
    this.running = true;
    log(
      "info",
      "polling",
      `Starting — ${this.activeModules.join(", ")} every ${this.intervalMs}ms`,
    );
    this.poll(); // immediate first poll
    this.timer = setInterval(() => this.poll(), this.intervalMs);
  }

  /**
   * Stop the polling loop.
   */
  stop(): void {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    log("info", "polling", "Stopped");
  }

  /**
   * Run a single poll cycle manually.
   */
  async poll(): Promise<void> {
    if (!this.running || this.polling) return;
    this.polling = true;

    try {
      for (const module of this.activeModules) {
        await this.pollModule(module);
      }
    } finally {
      this.polling = false;
    }
  }

  private async pollModule(module: TwentyModule): Promise<void> {
    const objectName = MODULE_MAP[module];
    const config = POLL_DEFAULTS[module];
    const cursor = this.cursors.get(module)!;

    try {
      const result = await this.twenty.findRecords(objectName, {
        limit: config.limit,
        orderBy: config.orderBy,
        cursor: cursor.lastCursor ?? undefined,
      });

      const records = (result.data ?? []) as Record<string, unknown>[];

      if (records.length === 0) {
        cursor.lastPolledAt = new Date().toISOString();
        return;
      }

      // Update cursor to the last record's id for next poll
      const lastRecord = records[records.length - 1];
      if (lastRecord?.id) {
        cursor.lastCursor = String(lastRecord.id);
      }
      cursor.lastPolledAt = new Date().toISOString();

      // Emit events for handlers
      const handlers = this.handlers.get(module) ?? [];
      if (handlers.length > 0) {
        for (const record of records) {
          const event: TwentyEvent = {
            module,
            action: record.createdAt === record.updatedAt ? "created" : "updated",
            record,
            timestamp: new Date().toISOString(),
          };

          // Skip already-processed records using lastProcessedId
          const recordId = String(record.id ?? "");
          if (cursor.lastProcessedId && cursor.lastProcessedId === recordId) {
            continue;
          }

          cursor.processedCount++;
          cursor.lastProcessedId = recordId;

          for (const handler of handlers) {
            try {
              await handler(event);
            } catch (err) {
              log("error", "polling", `Handler error for ${module}`, {
                recordId,
                error: String(err),
              });
            }
          }
        }
      }

      log("debug", "polling", `Polled ${module}: ${records.length} records`, {
        lastCursor: cursor.lastCursor,
      });
    } catch (err) {
      log("error", "polling", `Poll failed for ${module}: ${err}`);
    }
  }
}
