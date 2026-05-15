import { describe, it, expect, vi, beforeEach } from "vitest";
import { TwentyPollingEngine } from "./polling.js";
import type { TwentyMCPClient } from "./client.js";
import type { TwentyModule, SyncState } from "./types.js";
import type { ModuleCursor } from "./types.js";

// ── Mock MCP Client ────────────────────────────────────────

function mockClient(): TwentyMCPClient {
  return {
    findRecords: vi.fn(),
    executeTool: vi.fn(),
    getTools: () => [],
    isConnected: () => true,
    connect: vi.fn(),
    disconnect: vi.fn(),
  } as unknown as TwentyMCPClient;
}

// ── Fixtures ───────────────────────────────────────────────

// makeCursor is reserved for future use
function _makeCursor(module: TwentyModule): ModuleCursor {
  return {
    module,
    lastCursor: null,
    lastPolledAt: "2024-01-01T00:00:00.000Z",
    processedCount: 0,
  };
}

function makeState(cursors: Record<string, ModuleCursor>): SyncState {
  return {
    cursors,
    lastFullSyncAt: "2024-01-01T00:00:00.000Z",
    agentMemory: {},
  };
}

// ── Constructor ───────────────────────────────────────────

describe("TwentyPollingEngine constructor", () => {
  it("initializes handlers and cursors for each module", () => {
    const client = mockClient();
    const engine = new TwentyPollingEngine(client, ["note", "task"], 30_000);

    // Should have handlers map
    const noteHandlers = engine["handlers"].get("note");
    const taskHandlers = engine["handlers"].get("task");
    expect(noteHandlers).toBeDefined();
    expect(taskHandlers).toBeDefined();
    expect(noteHandlers).toHaveLength(0);
    expect(taskHandlers).toHaveLength(0);

    // Should have cursors
    const noteCursor = engine["cursors"].get("note");
    const taskCursor = engine["cursors"].get("task");
    expect(noteCursor?.module).toBe("note");
    expect(taskCursor?.module).toBe("task");
  });

  it("stores intervalMs", () => {
    const client = mockClient();
    const engine = new TwentyPollingEngine(client, ["note"], 45_000);
    expect(engine["intervalMs"]).toBe(45_000);
  });
});

// ── on (register handler) ──────────────────────────────────

describe("TwentyPollingEngine.on", () => {
  it("registers handler for a module", () => {
    const client = mockClient();
    const engine = new TwentyPollingEngine(client, ["note", "task"], 30_000);

    const handler = vi.fn();
    engine.on("note", handler);
    engine.on("note", handler); // register twice

    const handlers = engine["handlers"].get("note")!;
    expect(handlers).toHaveLength(2);
    expect(handlers[0]).toBe(handler);
  });

  it("does nothing for unknown module", () => {
    const client = mockClient();
    const engine = new TwentyPollingEngine(client, ["note"], 30_000);

    // Should not throw
    const handler = vi.fn();
    engine.on("unknown_module" as TwentyModule, handler);

    expect(engine["handlers"].get("unknown_module" as TwentyModule)).toBeUndefined();
  });
});

// ── loadState / getState ───────────────────────────────────

describe("TwentyPollingEngine state", () => {
  it("loadState restores cursors for active modules", () => {
    const client = mockClient();
    const engine = new TwentyPollingEngine(client, ["note", "task"], 30_000);

    const state = makeState({
      note: {
        module: "note",
        lastCursor: "cursor-123",
        lastPolledAt: "2024-01-01T00:00:00.000Z",
        processedCount: 5,
      },
      task: {
        module: "task",
        lastCursor: "cursor-456",
        lastPolledAt: "2024-01-02T00:00:00.000Z",
        processedCount: 10,
      },
    });

    engine.loadState(state);

    const noteCursor = engine["cursors"].get("note");
    const taskCursor = engine["cursors"].get("task");
    expect(noteCursor?.lastCursor).toBe("cursor-123");
    expect(noteCursor?.processedCount).toBe(5);
    expect(taskCursor?.lastCursor).toBe("cursor-456");
    expect(taskCursor?.processedCount).toBe(10);
  });

  it("loadState ignores inactive modules", () => {
    const client = mockClient();
    const engine = new TwentyPollingEngine(client, ["note"], 30_000);

    const state = makeState({
      task: {
        module: "task",
        lastCursor: "ignore-me",
        lastPolledAt: "2024-01-01T00:00:00.000Z",
        processedCount: 1,
      },
    });

    engine.loadState(state);

    const noteCursor = engine["cursors"].get("note");
    expect(noteCursor?.lastCursor).toBeNull(); // not overridden
  });

  it("getState returns current cursor state", () => {
    const client = mockClient();
    const engine = new TwentyPollingEngine(client, ["note"], 30_000);
    engine["cursors"].get("note")!.lastCursor = "current-cursor";

    const state = engine.getState();
    expect(state.note.lastCursor).toBe("current-cursor");
  });
});

// ── start / stop ───────────────────────────────────────────

describe("TwentyPollingEngine start/stop", () => {
  let client: TwentyMCPClient;
  let engine: TwentyPollingEngine;
  let _clock: ReturnType<typeof vi.useFakeTimers>;

  beforeEach(() => {
    client = mockClient();
    engine = new TwentyPollingEngine(client, ["note"], 30_000);
  });

  it("start sets running=true", () => {
    vi.useFakeTimers();
    engine.start();
    expect(engine["running"]).toBe(true);
    engine.stop();
    vi.useRealTimers();
  });

  it("start is idempotent", () => {
    vi.useFakeTimers();
    engine.start();
    engine.start(); // second call
    expect(engine["running"]).toBe(true);
    engine.stop();
    vi.useRealTimers();
  });

  it("stop sets running=false", () => {
    vi.useFakeTimers();
    engine.start();
    expect(engine["running"]).toBe(true);
    engine.stop();
    expect(engine["running"]).toBe(false);
    vi.useRealTimers();
  });

  it("stop clears the interval timer", () => {
    vi.useFakeTimers();
    engine.start();
    const _timerBefore = engine["timer"];
    engine.stop();
    expect(engine["timer"]).toBeNull();
    // Timer before stop should have been cleared
    vi.useRealTimers();
  });

  it("start triggers immediate first poll", async () => {
    vi.useFakeTimers();
    const _pollModule = vi.spyOn(
      engine as unknown as { pollModule: () => Promise<void> },
      "pollModule",
    );
    engine.start();
    // poll() is called synchronously on start
    expect(engine["running"]).toBe(true);
    engine.stop();
    vi.useRealTimers();
  });
});

// ── pollModule ─────────────────────────────────────────────

describe("TwentyPollingEngine.pollModule", () => {
  let client: TwentyMCPClient;
  let engine: TwentyPollingEngine;

  beforeEach(() => {
    client = mockClient();
    engine = new TwentyPollingEngine(client, ["note", "task"], 30_000);
  });

  it("calls twenty.findRecords with correct params", async () => {
    vi.useFakeTimers();
    engine.start();

    const mockRecords = [
      {
        id: "r1",
        name: "Note 1",
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
      },
      {
        id: "r2",
        name: "Note 2",
        createdAt: "2024-01-02T00:00:00.000Z",
        updatedAt: "2024-01-02T00:00:00.000Z",
      },
    ];
    (client.findRecords as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ data: mockRecords });

    await engine["pollModule"]("note");

    expect(client.findRecords).toHaveBeenCalledWith("note", {
      limit: 5,
      orderBy: { createdAt: "DescNullsFirst" },
      cursor: null,
    });
    engine.stop();
    vi.useRealTimers();
  });

  it("passes cursor to findRecords when set", async () => {
    vi.useFakeTimers();
    engine.start();
    engine["cursors"].get("note")!.lastCursor = "cursor-xyz";

    (client.findRecords as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ data: [] });

    await engine["pollModule"]("note");

    expect(client.findRecords).toHaveBeenCalledWith(
      "note",
      expect.objectContaining({ cursor: "cursor-xyz" }),
    );
    engine.stop();
    vi.useRealTimers();
  });

  it("updates cursor.lastRecordId from result", async () => {
    vi.useFakeTimers();
    engine.start();
    const mockRecords = [
      {
        id: "new-record",
        name: "Test",
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
      },
    ];
    (client.findRecords as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ data: mockRecords });

    await engine["pollModule"]("note");

    expect(engine["cursors"].get("note")!.lastCursor).toBe("new-record");
    engine.stop();
    vi.useRealTimers();
  });

  it("calls handlers with events for each record", async () => {
    vi.useFakeTimers();
    engine.start();
    const handler = vi.fn();

    const mockRecords = [
      {
        id: "rec1",
        name: "First",
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
      },
      {
        id: "rec2",
        name: "Second",
        createdAt: "2024-01-02T00:00:00.000Z",
        updatedAt: "2024-01-02T00:00:00.000Z",
      },
    ];
    (client.findRecords as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ data: mockRecords });
    engine.on("note", handler);

    await engine["pollModule"]("note");

    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        module: "note",
        record: mockRecords[0],
      }),
    );
    engine.stop();
    vi.useRealTimers();
  });

  it("marks created vs updated based on timestamps", async () => {
    vi.useFakeTimers();
    engine.start();
    const handler = vi.fn();

    const mockRecords = [
      {
        id: "brand-new",
        name: "New",
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
      },
      {
        id: "modified",
        name: "Mod",
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-02T00:00:00.000Z",
      },
    ];
    (client.findRecords as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ data: mockRecords });
    engine.on("note", handler);

    await engine["pollModule"]("note");

    expect(handler).toHaveBeenNthCalledWith(1, expect.objectContaining({ action: "created" }));
    expect(handler).toHaveBeenNthCalledWith(2, expect.objectContaining({ action: "updated" }));
    engine.stop();
    vi.useRealTimers();
  });

  it("handles empty result gracefully", async () => {
    vi.useFakeTimers();
    engine.start();
    (client.findRecords as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ data: [] });

    // Should not throw
    await engine["pollModule"]("note");
    expect(engine["cursors"].get("note")!.lastPolledAt).toBeTruthy();
    engine.stop();
    vi.useRealTimers();
  });

  it("handles findRecords throwing an error", async () => {
    vi.useFakeTimers();
    engine.start();
    (client.findRecords as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("network error"),
    );

    // Should not throw — errors are caught internally
    await engine["pollModule"]("note");
    engine.stop();
    vi.useRealTimers();
  });

  it("increments processedCount per record", async () => {
    vi.useFakeTimers();
    engine.start();
    const mockRecords = [
      {
        id: "r1",
        name: "A",
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
      },
      {
        id: "r2",
        name: "B",
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
      },
    ];
    (client.findRecords as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ data: mockRecords });

    await engine["pollModule"]("note");

    expect(engine["cursors"].get("note")!.processedCount).toBe(2);
    engine.stop();
    vi.useRealTimers();
  });

  it("uses correct objectName mapping per module", async () => {
    vi.useFakeTimers();
    engine.start();
    (client.findRecords as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ data: [] });

    await engine["pollModule"]("task");

    // task maps to "task" object name
    expect(client.findRecords).toHaveBeenCalledWith("task", expect.any(Object));
    engine.stop();
    vi.useRealTimers();
  });
});

// ── poll (aggregate) ────────────────────────────────────────

describe("TwentyPollingEngine.poll", () => {
  it("polls all active modules", async () => {
    const client = mockClient();
    const engine = new TwentyPollingEngine(client, ["note", "task"], 30_000);
    vi.useFakeTimers();
    engine.start();

    const pollModule = vi.spyOn(
      engine as unknown as { pollModule: (mod: TwentyModule) => Promise<void> },
      "pollModule",
    );

    await engine.poll();

    expect(pollModule).toHaveBeenCalledWith("note");
    expect(pollModule).toHaveBeenCalledWith("task");
    engine.stop();
    vi.useRealTimers();
  });

  it("does nothing when not running", async () => {
    const client = mockClient();
    const engine = new TwentyPollingEngine(client, ["note"], 30_000);
    engine["running"] = false;

    const pollModule = vi.spyOn(
      engine as unknown as { pollModule: (mod: TwentyModule) => Promise<void> },
      "pollModule",
    );

    await engine.poll();

    expect(pollModule).not.toHaveBeenCalled();
  });
});
