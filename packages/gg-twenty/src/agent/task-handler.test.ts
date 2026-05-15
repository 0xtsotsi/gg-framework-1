/**
 * Tests for Task Handler (task-handler.ts)
 * Mocks @kenkaiiii/gg-agent and @kenkaiiii/gg-ai.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mock agent dependencies ──────────────────────────────────────────────────

async function* emptyAgentLoop(_messages: unknown, _opts: unknown): AsyncGenerator<object> {
  yield { type: "turn_end", usage: { inputTokens: 100, outputTokens: 50 } };
}

const mockAgentLoop = vi.fn().mockImplementation(emptyAgentLoop);

vi.mock("@kenkaiiii/gg-agent", () => ({
  agentLoop: mockAgentLoop,
}));

vi.mock("@kenkaiiii/gg-ai", () => ({}));

import type { TwentyMCPClient } from "../twenty/client.js";
import type { TwentyEvent } from "../twenty/types.js";
import { handleTaskEvent } from "./task-handler.js";

describe("handleTaskEvent", () => {
  const mockTwenty: Partial<TwentyMCPClient> = {
    updateRecord: vi
      .fn<(module: string, id: string, data: Record<string, unknown>) => Promise<void>>()
      .mockResolvedValue(undefined),
    createRecord: vi
      .fn<(module: string, data: Record<string, unknown>) => Promise<{ id: string }>>()
      .mockResolvedValue({ id: "task-created" }),
    executeTool: vi.fn().mockResolvedValue({ success: true }),
    findRecords: vi.fn().mockResolvedValue({ data: [] }),
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

  it("skips completed tasks (status=done)", async () => {
    const event: TwentyEvent = {
      module: "task",
      action: "updated",
      record: { id: "task-done", title: "Done Task", status: "done" },
      timestamp: new Date().toISOString(),
    };

    const result = await handleTaskEvent(event, mockTwenty as TwentyMCPClient, defaultConfig);

    expect(result).toBeNull();
    expect(mockAgentLoop).not.toHaveBeenCalled();
  });

  it("skips completed tasks (status=completed)", async () => {
    const event: TwentyEvent = {
      module: "task",
      action: "updated",
      record: { id: "task-completed", title: "Completed Task", status: "completed" },
      timestamp: new Date().toISOString(),
    };

    const result = await handleTaskEvent(event, mockTwenty as TwentyMCPClient, defaultConfig);

    expect(result).toBeNull();
  });

  it("processes a task in backlog", async () => {
    const event: TwentyEvent = {
      module: "task",
      action: "created",
      record: {
        id: "task-001",
        title: "Review PR",
        body: "Check the code changes",
        status: "backlog",
      },
      timestamp: new Date().toISOString(),
    };

    mockAgentLoop.mockImplementation(function* (messages, _opts) {
      messages.push({
        role: "assistant",
        content: JSON.stringify({
          status: "todo",
          priority: "high",
          dueDate: "today",
          notes: "Needs quick review",
        }),
      });
      yield { type: "turn_end", usage: { inputTokens: 60, outputTokens: 40 } };
    });

    const result = await handleTaskEvent(event, mockTwenty as TwentyMCPClient, defaultConfig);

    expect(result).not.toBeNull();
    expect(result?.module).toBe("task");
    expect(result?.recordId).toBe("task-001");
    expect(result?.tokensUsed).toBe(100);
  });

  it("updates task status with AI suggestion", async () => {
    const event: TwentyEvent = {
      module: "task",
      action: "updated",
      record: { id: "task-002", title: "Send invoice", body: "To client Acme", status: "todo" },
      timestamp: new Date().toISOString(),
    };

    mockAgentLoop.mockImplementation(function* (messages, _opts) {
      messages.push({
        role: "assistant",
        content: JSON.stringify({ status: "in_progress", priority: "high", dueDate: "today" }),
      });
      yield { type: "turn_end", usage: { inputTokens: 20, outputTokens: 20 } };
    });

    await handleTaskEvent(event, mockTwenty as TwentyMCPClient, defaultConfig);

    expect(mockTwenty.updateRecord).toHaveBeenCalledWith(
      "task",
      "task-002",
      expect.objectContaining({ status: expect.any(String) }),
    );
  });

  it("posts AI analysis as activity", async () => {
    const event: TwentyEvent = {
      module: "task",
      action: "created",
      record: { id: "task-003", title: "Follow up", body: "Call client", status: "backlog" },
      timestamp: new Date().toISOString(),
    };

    mockAgentLoop.mockImplementation(function* (messages, _opts) {
      messages.push({
        role: "assistant",
        content: JSON.stringify({
          status: "todo",
          priority: "medium",
          dueDate: "this_week",
          notes: "Remember to ask about budget",
        }),
      });
      yield { type: "turn_end", usage: { inputTokens: 10, outputTokens: 10 } };
    });

    await handleTaskEvent(event, mockTwenty as TwentyMCPClient, defaultConfig);

    expect(mockTwenty.executeTool).toHaveBeenCalledWith(
      "execute_mcp_tool",
      expect.objectContaining({
        serviceName: "standard",
        toolName: "create_activity",
      }),
    );
  });

  it("updates task with priority when provided", async () => {
    const event: TwentyEvent = {
      module: "task",
      action: "created",
      record: { id: "task-004", title: "Urgent Fix", body: "Production bug", status: "backlog" },
      timestamp: new Date().toISOString(),
    };

    mockAgentLoop.mockImplementation(function* (messages, _opts) {
      messages.push({
        role: "assistant",
        content: JSON.stringify({ status: "todo", priority: "high" }),
      });
      yield { type: "turn_end", usage: { inputTokens: 5, outputTokens: 5 } };
    });

    await handleTaskEvent(event, mockTwenty as TwentyMCPClient, defaultConfig);

    const updateCall = (mockTwenty.updateRecord as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      string,
      Record<string, unknown>,
    ];
    const updateData = updateCall[2] as Record<string, unknown>;
    expect(String(updateData.status ?? "")).toContain("priority:high");
  });

  it("does not update if parsed has no actionable fields", async () => {
    const event: TwentyEvent = {
      module: "task",
      action: "created",
      record: { id: "task-005", title: "Weird Task", body: "Something", status: "backlog" },
      timestamp: new Date().toISOString(),
    };

    mockAgentLoop.mockImplementation(function* (messages, _opts) {
      messages.push({ role: "assistant", content: "{}" });
      yield { type: "turn_end", usage: { inputTokens: 5, outputTokens: 5 } };
    });

    await handleTaskEvent(event, mockTwenty as TwentyMCPClient, defaultConfig);

    expect(mockTwenty.updateRecord).not.toHaveBeenCalled();
  });

  it("posts plain text response as activity when not JSON", async () => {
    const event: TwentyEvent = {
      module: "task",
      action: "updated",
      record: { id: "task-006", title: "Plain Text Task", body: "Body", status: "backlog" },
      timestamp: new Date().toISOString(),
    };

    mockAgentLoop.mockImplementation(function* (messages, _opts) {
      messages.push({ role: "assistant", content: "This is raw analysis text." });
      yield { type: "turn_end", usage: { inputTokens: 5, outputTokens: 5 } };
    });

    await handleTaskEvent(event, mockTwenty as TwentyMCPClient, defaultConfig);

    expect(mockTwenty.executeTool).toHaveBeenCalledWith(
      "execute_mcp_tool",
      expect.objectContaining({
        toolName: "create_activity",
      }),
    );
  });

  it("returns AgentResponse with correct fields", async () => {
    const event: TwentyEvent = {
      module: "task",
      action: "created",
      record: { id: "task-meta", title: "Meta Task", body: "Body", status: "todo" },
      timestamp: new Date().toISOString(),
    };

    mockAgentLoop.mockImplementation(function* (messages, _opts) {
      messages.push({ role: "assistant", content: '{"status":"in_progress","priority":"low"}' });
      yield { type: "tool_call_end", name: "find_twenty_people" };
      yield { type: "turn_end", usage: { inputTokens: 15, outputTokens: 15 } };
    });

    const result = await handleTaskEvent(event, mockTwenty as TwentyMCPClient, defaultConfig);

    expect(result).toMatchObject({
      module: "task",
      recordId: "task-meta",
      action: "created",
      tokensUsed: 30,
    });
    expect(result?.toolsUsed).toContain("find_twenty_people");
  });

  it("returns null on agent exception", async () => {
    const event: TwentyEvent = {
      module: "task",
      action: "created",
      record: { id: "task-err", title: "Error Task", body: "Body", status: "backlog" },
      timestamp: new Date().toISOString(),
    };

    mockAgentLoop.mockRejectedValue(new Error("Provider rate limited"));

    const result = await handleTaskEvent(event, mockTwenty as TwentyMCPClient, defaultConfig);

    expect(result).toBeNull();
  });

  it("uses task body in agent prompt", async () => {
    const event: TwentyEvent = {
      module: "task",
      action: "created",
      record: {
        id: "task-prompt",
        title: "Write docs",
        body: "Document the new API endpoints",
        status: "backlog",
      },
      timestamp: new Date().toISOString(),
    };

    mockAgentLoop.mockImplementation(function* (messages, _opts) {
      // Verify the user message contains body content
      const userMsg = messages.find((m: { role: string }) => m.role === "user") as {
        content: string;
      };
      expect(userMsg.content).toContain("Document the new API endpoints");
      messages.push({ role: "assistant", content: "{}" });
      yield { type: "turn_end", usage: { inputTokens: 10, outputTokens: 10 } };
    });

    await handleTaskEvent(event, mockTwenty as TwentyMCPClient, defaultConfig);

    expect(mockAgentLoop).toHaveBeenCalled();
  });
});
