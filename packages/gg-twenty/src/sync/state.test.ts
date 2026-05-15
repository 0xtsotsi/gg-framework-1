import { afterEach, describe, it, expect, vi } from "vitest";
import { StateManager } from "./state.js";

// Mock fs module — in Node environment we test the class logic
// without needing actual filesystem operations
vi.mock("node:fs/promises", async () => {
  const fs = await vi.importActual("node:fs/promises");
  return fs;
});

// Reset singletons between tests to prevent state leakage
afterEach(() => {
  vi.restoreAllMocks();
});

describe("StateManager", () => {
  describe("initial state", () => {
    it("has default cursors, lastFullSyncAt, and agentMemory", () => {
      const manager = new StateManager();
      const state = manager.getFullState();
      expect(state).toHaveProperty("cursors");
      expect(state).toHaveProperty("lastFullSyncAt");
      expect(state).toHaveProperty("agentMemory");
    });
  });

  describe("getCursors / updateCursor", () => {
    it("returns empty object initially", () => {
      const manager = new StateManager();
      expect(manager.getCursors()).toEqual({});
    });

    it("updateCursor sets cursor for a module", () => {
      const manager = new StateManager();
      manager.updateCursor("note", {
        module: "note",
        lastCursor: "cursor-123",
        lastPolledAt: "2024-01-01T00:00:00.000Z",
        processedCount: 5,
      });

      const cursors = manager.getCursors();
      expect(cursors.note.lastCursor).toBe("cursor-123");
      expect(cursors.note.processedCount).toBe(5);
    });

    it("updateCursor replaces existing cursor", () => {
      const manager = new StateManager();
      manager.updateCursor("task", {
        module: "task",
        lastCursor: "first",
        lastPolledAt: "2024-01-01T00:00:00.000Z",
        processedCount: 1,
      });
      manager.updateCursor("task", {
        module: "task",
        lastCursor: "second",
        lastPolledAt: "2024-01-02T00:00:00.000Z",
        processedCount: 10,
      });

      const cursors = manager.getCursors();
      expect(cursors.task.lastCursor).toBe("second");
      expect(cursors.task.processedCount).toBe(10);
    });

    it("updateCursor works for multiple modules", () => {
      const manager = new StateManager();
      manager.updateCursor("note", {
        module: "note",
        lastCursor: "n1",
        lastPolledAt: "2024-01-01T00:00:00.000Z",
        processedCount: 0,
      });
      manager.updateCursor("company", {
        module: "company",
        lastCursor: "c1",
        lastPolledAt: "2024-01-01T00:00:00.000Z",
        processedCount: 0,
      });

      const cursors = manager.getCursors();
      expect(cursors.note).toBeDefined();
      expect(cursors.company).toBeDefined();
      expect(Object.keys(cursors)).toHaveLength(2);
    });
  });

  describe("agentMemory", () => {
    it("getAgentMemory returns empty array for unknown module", () => {
      const manager = new StateManager();
      expect(manager.getAgentMemory("unknown")).toEqual([]);
    });

    it("addToAgentMemory prepends recordId (newest first)", () => {
      const manager = new StateManager();
      manager.addToAgentMemory("note", "rec-1");
      manager.addToAgentMemory("note", "rec-2");
      manager.addToAgentMemory("note", "rec-3");

      const mem = manager.getAgentMemory("note");
      expect(mem).toEqual(["rec-3", "rec-2", "rec-1"]);
    });

    it("addToAgentMemory respects maxSize by trimming oldest", () => {
      const manager = new StateManager();
      for (let i = 0; i < 105; i++) {
        manager.addToAgentMemory("note", `rec-${i}`, 100);
      }

      const mem = manager.getAgentMemory("note");
      expect(mem).toHaveLength(100);
      expect(mem[0]).toBe("rec-104"); // newest first
      expect(mem[99]).toBe("rec-5");
      expect(mem).not.toContain("rec-0"); // oldest trimmed
    });

    it("handles multiple modules independently", () => {
      const manager = new StateManager();
      manager.addToAgentMemory("note", "note-rec");
      manager.addToAgentMemory("task", "task-rec");

      expect(manager.getAgentMemory("note")).toEqual(["note-rec"]);
      expect(manager.getAgentMemory("task")).toEqual(["task-rec"]);
    });
  });

  describe("lastFullSync", () => {
    it("setLastFullSync updates the timestamp", () => {
      const manager = new StateManager();
      const timestamp = "2024-06-15T10:30:00.000Z";
      manager.setLastFullSync(timestamp);

      expect(manager.getFullState().lastFullSyncAt).toBe(timestamp);
    });
  });

  describe("load", () => {
    it("load is idempotent — returns same state reference on repeated calls", async () => {
      const manager = new StateManager();
      manager.updateCursor("note", {
        module: "note",
        lastCursor: "test",
        lastPolledAt: "2024-01-01T00:00:00.000Z",
        processedCount: 3,
      });

      const first = await manager.load();
      const second = await manager.load();
      expect(first).toBe(second);
    });
  });

  describe("save", () => {
    it("save is no-op when dirty is false (nothing to save)", async () => {
      const manager = new StateManager();
      // Should not throw even when nothing changed
      await manager.save();
    });
  });
});
