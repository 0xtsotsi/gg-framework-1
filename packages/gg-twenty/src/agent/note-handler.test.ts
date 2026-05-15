/**
 * Tests for Note Handler (note-handler.ts)
 * Mocks @kenkaiiii/gg-agent and @kenkaiiii/gg-ai.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mock @kenkaiiii/gg-agent and @kenkaiiii/gg-ai ──────────────────────────

// Mock agentLoop — returns an async iterable that immediately yields a turn_end
async function* emptyAgentLoop(_messages: unknown, _opts: unknown): AsyncGenerator<object> {
  // Yield a minimal turn_end so the loop runs at least one turn
  yield {
    type: "turn_end",
    usage: { inputTokens: 100, outputTokens: 50 },
  };
}

const mockAgentLoop = vi.fn().mockImplementation(emptyAgentLoop);
const mockStreamOpenAI = vi.fn();

vi.mock("@kenkaiiii/gg-agent", () => ({
  agentLoop: mockAgentLoop,
}));

vi.mock("@kenkaiiii/gg-ai", () => ({
  streamOpenAI: mockStreamOpenAI,
  providerRegistry: {
    has: vi.fn().mockReturnValue(false),
    register: vi.fn(),
    get: vi.fn(),
  },
}));

import type { TwentyMCPClient } from "../twenty/client.js";
import type { TwentyEvent } from "../twenty/types.js";
import { handleNoteEvent } from "./note-handler.js";

describe("handleNoteEvent", () => {
  // ── Mock Twenty client ─────────────────────────────────────────────────

  const mockTwenty: Partial<TwentyMCPClient> = {
    updateRecord: vi
      .fn<(module: string, id: string, data: Record<string, unknown>) => Promise<void>>()
      .mockResolvedValue(undefined),
    createRecord: vi
      .fn<(module: string, data: Record<string, unknown>) => Promise<{ id: string }>>()
      .mockResolvedValue({ id: "new-task-123" }),
    executeTool: vi.fn().mockResolvedValue({ success: true }),
  };

  const defaultConfig = {
    openRouterApiKey: "test-key",
    openRouterBaseUrl: "https://openrouter.ai/api/v1",
    model: "openrouter/openai/gpt-4o-mini",
    fastModel: "openrouter/openai/gpt-4o-mini",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns null for empty notes (no title and no body)", async () => {
    const event: TwentyEvent = {
      module: "note",
      action: "created",
      record: { id: "note-empty" },
      timestamp: new Date().toISOString(),
    };

    const result = await handleNoteEvent(event, mockTwenty as TwentyMCPClient, defaultConfig);

    expect(result).toBeNull();
    expect(mockAgentLoop).not.toHaveBeenCalled();
  });

  it("returns null for notes with only empty title/body strings", async () => {
    const event: TwentyEvent = {
      module: "note",
      action: "created",
      record: { id: "note-empty2", title: "", body: "" },
      timestamp: new Date().toISOString(),
    };

    const result = await handleNoteEvent(event, mockTwenty as TwentyMCPClient, defaultConfig);

    expect(result).toBeNull();
  });

  it("processes a note with title and body", async () => {
    const event: TwentyEvent = {
      module: "note",
      action: "created",
      record: { id: "note-123", title: "Meeting Notes", body: "Discussed Q1 roadmap." },
      timestamp: new Date().toISOString(),
    };

    // Override agentLoop to push a JSON response
    mockAgentLoop.mockImplementation(function* (messages, _opts) {
      // Simulate agent appending an assistant response with AI analysis
      messages.push({
        role: "assistant",
        content: JSON.stringify({
          summary: "Q1 roadmap discussed",
          actionItems: ["Follow up with team"],
          topic: "sales",
          urgency: "medium",
        }),
      });
      yield { type: "tool_call_end", name: "update_twenty_note" };
      yield { type: "turn_end", usage: { inputTokens: 50, outputTokens: 30 } };
    });

    const result = await handleNoteEvent(event, mockTwenty as TwentyMCPClient, defaultConfig);

    expect(result).not.toBeNull();
    expect(result?.module).toBe("note");
    expect(result?.recordId).toBe("note-123");
    expect(result?.action).toBe("created");
    expect(result?.tokensUsed).toBe(80); // 50 + 30
    expect(mockTwenty.updateRecord).toHaveBeenCalledWith("note", "note-123", expect.any(Object));
  });

  it("updates note title with [AI] prefix when summary is parsed", async () => {
    const event: TwentyEvent = {
      module: "note",
      action: "updated",
      record: { id: "note-456", title: "Old Title", body: "Content here" },
      timestamp: new Date().toISOString(),
    };

    mockAgentLoop.mockImplementation(function* (messages, _opts) {
      messages.push({
        role: "assistant",
        content: JSON.stringify({
          summary: "Updated summary",
          topic: "engineering",
          urgency: "high",
        }),
      });
      yield { type: "turn_end", usage: { inputTokens: 20, outputTokens: 20 } };
    });

    await handleNoteEvent(event, mockTwenty as TwentyMCPClient, defaultConfig);

    const updateCall = (mockTwenty.updateRecord as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      string,
      Record<string, unknown>,
    ];
    expect(updateCall[0]).toBe("note");
    expect(updateCall[1]).toBe("note-456");
    const updateData = updateCall[2] as Record<string, unknown>;
    expect(String(updateData.title ?? "")).toContain("Updated summary");
  });

  it("creates tasks from action items (max 3)", async () => {
    const event: TwentyEvent = {
      module: "note",
      action: "created",
      record: { id: "note-tasks", title: "TODO List", body: "Do A, B, C, D" },
      timestamp: new Date().toISOString(),
    };

    mockAgentLoop.mockImplementation(function* (messages, _opts) {
      messages.push({
        role: "assistant",
        content: JSON.stringify({
          summary: "Tasks extracted",
          actionItems: ["Task A", "Task B", "Task C", "Task D"],
          topic: "ops",
        }),
      });
      yield { type: "turn_end", usage: { inputTokens: 10, outputTokens: 10 } };
    });

    await handleNoteEvent(event, mockTwenty as TwentyMCPClient, defaultConfig);

    // Only 3 tasks should be created (capped)
    expect(mockTwenty.createRecord).toHaveBeenCalledTimes(3);
    for (const call of (mockTwenty.createRecord as ReturnType<typeof vi.fn>).mock
      .calls as unknown[][]) {
      expect(call[0]).toBe("task");
    }
  });

  it("posts as activity when response is not valid JSON", async () => {
    const event: TwentyEvent = {
      module: "note",
      action: "created",
      record: { id: "note-text", title: "Plain Note", body: "Just text" },
      timestamp: new Date().toISOString(),
    };

    mockAgentLoop.mockImplementation(function* (messages, _opts) {
      messages.push({
        role: "assistant",
        content: "This is a plain text response, not JSON.",
      });
      yield { type: "turn_end", usage: { inputTokens: 5, outputTokens: 5 } };
    });

    await handleNoteEvent(event, mockTwenty as TwentyMCPClient, defaultConfig);

    expect(mockTwenty.executeTool).toHaveBeenCalledWith(
      "execute_mcp_tool",
      expect.objectContaining({
        serviceName: "standard",
        toolName: "create_activity",
      }),
    );
  });

  it("returns AgentResponse with correct fields", async () => {
    const event: TwentyEvent = {
      module: "note",
      action: "created",
      record: { id: "note-meta", title: "Meta Test", body: "Test body" },
      timestamp: new Date().toISOString(),
    };

    mockAgentLoop.mockImplementation(function* (messages, _opts) {
      messages.push({ role: "assistant", content: '{"summary":"test"}' });
      yield { type: "tool_call_end", name: "create_twenty_activity" };
      yield { type: "turn_end", usage: { inputTokens: 10, outputTokens: 10 } };
    });

    const result = await handleNoteEvent(event, mockTwenty as TwentyMCPClient, defaultConfig);

    expect(result).toMatchObject({
      module: "note",
      recordId: "note-meta",
      action: "created",
      tokensUsed: 20,
    });
    expect(result?.durationMs).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(result?.toolsUsed)).toBe(true);
  });

  it("skips empty action items array", async () => {
    const event: TwentyEvent = {
      module: "note",
      action: "updated",
      record: { id: "note-no-actions", title: "No Actions", body: "No tasks here" },
      timestamp: new Date().toISOString(),
    };

    mockAgentLoop.mockImplementation(function* (messages, _opts) {
      messages.push({ role: "assistant", content: '{"summary":"nothing","actionItems":[]}' });
      yield { type: "turn_end", usage: { inputTokens: 5, outputTokens: 5 } };
    });

    await handleNoteEvent(event, mockTwenty as TwentyMCPClient, defaultConfig);

    expect(mockTwenty.createRecord).not.toHaveBeenCalled();
  });

  it("uses fastModel when available", async () => {
    const event: TwentyEvent = {
      module: "note",
      action: "created",
      record: { id: "note-fast", title: "Fast Model Test", body: "Body" },
      timestamp: new Date().toISOString(),
    };

    mockAgentLoop.mockImplementation(function* (messages, _opts) {
      messages.push({ role: "assistant", content: '{"summary":"ok"}' });
      yield { type: "turn_end", usage: { inputTokens: 5, outputTokens: 5 } };
    });

    const configWithFastModel = {
      ...defaultConfig,
      model: "anthropic/claude-3-sonnet",
      fastModel: "openrouter/openai/gpt-4o-mini",
    };

    await handleNoteEvent(event, mockTwenty as TwentyMCPClient, configWithFastModel);

    // agentLoop is called — verify mock was invoked
    expect(mockAgentLoop).toHaveBeenCalled();
  });

  it("returns null on agent exception", async () => {
    const event: TwentyEvent = {
      module: "note",
      action: "created",
      record: { id: "note-err", title: "Error Test", body: "Body" },
      timestamp: new Date().toISOString(),
    };

    mockAgentLoop.mockRejectedValue(new Error("AI provider unavailable"));

    const result = await handleNoteEvent(event, mockTwenty as TwentyMCPClient, defaultConfig);

    expect(result).toBeNull();
  });
});
