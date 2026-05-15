/**
 * Persistent state manager for gg-twenty.
 * Stores polling cursors and agent memory across restarts.
 */

import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import type { SyncState, ModuleCursor } from "../twenty/types.js";

const STATE_FILE = path.join(os.homedir(), ".gg", "twenty-state.json");

const DEFAULT_STATE: SyncState = {
  cursors: {},
  lastFullSyncAt: new Date(0).toISOString(),
  agentMemory: {},
};

export class StateManager {
  private state: SyncState = { ...DEFAULT_STATE };
  private loaded = false;
  private dirty = false;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private saving = false;

  async load(): Promise<SyncState> {
    if (this.loaded) return this.state;

    try {
      const raw = await fs.readFile(STATE_FILE, "utf-8");
      const parsed = JSON.parse(raw) as SyncState;
      this.state = { ...DEFAULT_STATE, ...parsed };
      this.loaded = true;
    } catch {
      this.state = { ...DEFAULT_STATE };
      this.loaded = true;
    }

    return this.state;
  }

  async save(): Promise<void> {
    if (!this.dirty || this.saving) return;
    this.saving = true;

    try {
      await fs.mkdir(path.dirname(STATE_FILE), { recursive: true });
      await fs.writeFile(STATE_FILE, JSON.stringify(this.state, null, 2), "utf-8");
      this.dirty = false;
    } catch (err) {
      console.error("[gg-twenty][state] Failed to save state:", err);
    } finally {
      this.saving = false;
    }
  }

  /**
   * Schedule a debounced save (500ms).
   */
  scheduleSave(): void {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(async () => {
      this.saveTimer = null;
      await this.save();
    }, 500);
  }

  getCursors(): Record<string, ModuleCursor> {
    return this.state.cursors;
  }

  updateCursor(module: string, cursor: ModuleCursor): void {
    this.state.cursors[module] = cursor;
    this.dirty = true;
    this.scheduleSave();
  }

  setLastFullSync(isoDate: string): void {
    this.state.lastFullSyncAt = isoDate;
    this.dirty = true;
    this.scheduleSave();
  }

  getAgentMemory(module: string): string[] {
    return this.state.agentMemory[module] ?? [];
  }

  addToAgentMemory(module: string, recordId: string, maxSize = 100): void {
    const mem = this.state.agentMemory[module] ?? [];
    mem.unshift(recordId);
    if (mem.length > maxSize) mem.length = maxSize;
    this.state.agentMemory[module] = mem;
    this.dirty = true;
    this.scheduleSave();
  }

  getFullState(): SyncState {
    return this.state;
  }
}
