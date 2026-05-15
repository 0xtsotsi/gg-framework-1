/**
 * Tests for Company Handler (company-handler.ts)
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
import { handleCompanyEvent } from "./company-handler.js";

describe("handleCompanyEvent", () => {
  const mockTwenty: Partial<TwentyMCPClient> = {
    updateRecord: vi
      .fn<(module: string, id: string, data: Record<string, unknown>) => Promise<void>>()
      .mockResolvedValue(undefined),
    createRecord: vi
      .fn<(module: string, data: Record<string, unknown>) => Promise<{ id: string }>>()
      .mockResolvedValue({ id: "created" }),
    executeTool: vi
      .fn<(toolName: string, args?: Record<string, unknown>) => Promise<unknown>>()
      .mockResolvedValue({ success: true }),
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

  it("processes a company with name and domain", async () => {
    const event: TwentyEvent = {
      module: "company",
      action: "created",
      record: { id: "company-001", name: "Acme Corp", domainName: "acme.com", industry: "Tech" },
      timestamp: new Date().toISOString(),
    };

    mockAgentLoop.mockImplementation(function* (messages, _opts) {
      messages.push({
        role: "assistant",
        content: JSON.stringify({ industry: "Software", leadScore: "hot", tags: ["saas", "b2b"] }),
      });
      yield { type: "turn_end", usage: { inputTokens: 80, outputTokens: 40 } };
    });

    const result = await handleCompanyEvent(event, mockTwenty as TwentyMCPClient, defaultConfig);

    expect(result).not.toBeNull();
    expect(result?.module).toBe("company");
    expect(result?.recordId).toBe("company-001");
    expect(result?.action).toBe("created");
    expect(result?.tokensUsed).toBe(120);
  });

  it("updates company industry when returned by agent", async () => {
    const event: TwentyEvent = {
      module: "company",
      action: "created",
      record: {
        id: "company-002",
        name: "TechStart",
        domainName: "techstart.io",
        industry: "Unknown",
      },
      timestamp: new Date().toISOString(),
    };

    mockAgentLoop.mockImplementation(function* (messages, _opts) {
      messages.push({
        role: "assistant",
        content: JSON.stringify({ industry: "FinTech", leadScore: "warm" }),
      });
      yield { type: "turn_end", usage: { inputTokens: 20, outputTokens: 20 } };
    });

    await handleCompanyEvent(event, mockTwenty as TwentyMCPClient, defaultConfig);

    expect(mockTwenty.updateRecord).toHaveBeenCalledWith(
      "company",
      "company-002",
      expect.objectContaining({ industry: "FinTech" }),
    );
  });

  it("does not call updateRecord when agent returns no industry", async () => {
    const event: TwentyEvent = {
      module: "company",
      action: "updated",
      record: { id: "company-003", name: "No Update", domainName: "noupdate.com" },
      timestamp: new Date().toISOString(),
    };

    mockAgentLoop.mockImplementation(function* (messages, _opts) {
      messages.push({
        role: "assistant",
        content: JSON.stringify({ leadScore: "cold", notes: "No industry data" }),
      });
      yield { type: "turn_end", usage: { inputTokens: 10, outputTokens: 10 } };
    });

    await handleCompanyEvent(event, mockTwenty as TwentyMCPClient, defaultConfig);

    expect(mockTwenty.updateRecord).not.toHaveBeenCalled();
  });

  it("posts activity with AI analysis formatted correctly", async () => {
    const event: TwentyEvent = {
      module: "company",
      action: "created",
      record: { id: "company-004", name: "SalesLead", domainName: "saleslead.com" },
      timestamp: new Date().toISOString(),
    };

    mockAgentLoop.mockImplementation(function* (messages, _opts) {
      messages.push({
        role: "assistant",
        content: JSON.stringify({
          industry: "Sales",
          leadScore: "hot",
          tags: ["enterprise"],
          decisionMaker: "VP Sales",
          notes: "High priority prospect",
        }),
      });
      yield { type: "turn_end", usage: { inputTokens: 15, outputTokens: 15 } };
    });

    await handleCompanyEvent(event, mockTwenty as TwentyMCPClient, defaultConfig);

    expect(mockTwenty.executeTool).toHaveBeenCalledWith(
      "execute_mcp_tool",
      expect.objectContaining({
        serviceName: "standard",
        toolName: "create_activity",
      }),
    );

    // Verify the activity content contains the AI analysis
    const activityCall = (mockTwenty.executeTool as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      { args: { content: string } },
    ];
    const args = activityCall[1];
    expect(args.args.content).toContain("Sales");
    expect(args.args.content).toContain("hot");
  });

  it("posts raw text as activity when response is not JSON", async () => {
    const event: TwentyEvent = {
      module: "company",
      action: "updated",
      record: { id: "company-005", name: "Text Company", domainName: "text.com" },
      timestamp: new Date().toISOString(),
    };

    mockAgentLoop.mockImplementation(function* (messages, _opts) {
      messages.push({ role: "assistant", content: "Plain text analysis from the agent." });
      yield { type: "turn_end", usage: { inputTokens: 5, outputTokens: 5 } };
    });

    await handleCompanyEvent(event, mockTwenty as TwentyMCPClient, defaultConfig);

    expect(mockTwenty.executeTool).toHaveBeenCalled();
    const activityCall = (mockTwenty.executeTool as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      { args: { content: string } },
    ];
    const args = activityCall[1];
    expect(args.args.content).toContain("Plain text analysis");
  });

  it("tracks tool names from tool_call_start and tool_call_end events", async () => {
    const event: TwentyEvent = {
      module: "company",
      action: "created",
      record: { id: "company-tools", name: "Tools Inc", domainName: "tools.com" },
      timestamp: new Date().toISOString(),
    };

    let callCount = 0;
    mockAgentLoop.mockImplementation(function* (messages, _opts) {
      messages.push({ role: "assistant", content: '{"industry":"Tech"}' });
      yield { type: "tool_call_start", toolCallId: "call-1", name: "search_twenty_people" };
      yield {
        type: "tool_call_end",
        toolCallId: "call-1",
        isError: false,
        name: "search_twenty_people",
      };
      yield { type: "tool_call_start", toolCallId: "call-2", name: "update_twenty_company" };
      yield {
        type: "tool_call_end",
        toolCallId: "call-2",
        isError: false,
        name: "update_twenty_company",
      };
      yield { type: "turn_end", usage: { inputTokens: 10, outputTokens: 10 } };
      callCount++;
    });

    const result = await handleCompanyEvent(event, mockTwenty as TwentyMCPClient, defaultConfig);

    expect(callCount).toBe(1);
    expect(result?.toolsUsed).toContain("search_twenty_people");
    expect(result?.toolsUsed).toContain("update_twenty_company");
  });

  it("filters duplicate tool names", async () => {
    const event: TwentyEvent = {
      module: "company",
      action: "created",
      record: { id: "company-dup", name: "Dup Corp", domainName: "dup.com" },
      timestamp: new Date().toISOString(),
    };

    mockAgentLoop.mockImplementation(function* (messages, _opts) {
      messages.push({ role: "assistant", content: "{}" });
      yield { type: "tool_call_start", toolCallId: "c1", name: "create_twenty_activity" };
      yield {
        type: "tool_call_end",
        toolCallId: "c1",
        isError: false,
        name: "create_twenty_activity",
      };
      yield { type: "tool_call_start", toolCallId: "c2", name: "create_twenty_activity" };
      yield {
        type: "tool_call_end",
        toolCallId: "c2",
        isError: false,
        name: "create_twenty_activity",
      };
      yield { type: "turn_end", usage: { inputTokens: 5, outputTokens: 5 } };
    });

    const result = await handleCompanyEvent(event, mockTwenty as TwentyMCPClient, defaultConfig);

    // Should only have one occurrence despite being called twice
    expect(result?.toolsUsed.filter((t) => t === "create_twenty_activity")).toHaveLength(1);
  });

  it("returns null on agent exception", async () => {
    const event: TwentyEvent = {
      module: "company",
      action: "created",
      record: { id: "company-err", name: "Error Inc", domainName: "error.com" },
      timestamp: new Date().toISOString(),
    };

    mockAgentLoop.mockRejectedValue(new Error("Connection timeout"));

    const result = await handleCompanyEvent(event, mockTwenty as TwentyMCPClient, defaultConfig);

    expect(result).toBeNull();
  });

  it("includes domain and industry in the agent prompt", async () => {
    const event: TwentyEvent = {
      module: "company",
      action: "created",
      record: {
        id: "company-prompt",
        name: "AI Corp",
        domainName: "ai.co",
        industry: "Artificial Intelligence",
        country: "US",
      },
      timestamp: new Date().toISOString(),
    };

    mockAgentLoop.mockImplementation(function* (messages, _opts) {
      const userMsg = messages.find((m: { role: string }) => m.role === "user") as {
        content: string;
      };
      expect(userMsg.content).toContain("ai.co");
      expect(userMsg.content).toContain("Artificial Intelligence");
      messages.push({ role: "assistant", content: "{}" });
      yield { type: "turn_end", usage: { inputTokens: 10, outputTokens: 10 } };
    });

    await handleCompanyEvent(event, mockTwenty as TwentyMCPClient, defaultConfig);

    expect(mockAgentLoop).toHaveBeenCalled();
  });

  it("returns AgentResponse with correct module", async () => {
    const event: TwentyEvent = {
      module: "company",
      action: "updated",
      record: { id: "company-resp", name: "Response Co", domainName: "resp.com" },
      timestamp: new Date().toISOString(),
    };

    mockAgentLoop.mockImplementation(function* (messages, _opts) {
      messages.push({ role: "assistant", content: '{"industry":"Media"}' });
      yield { type: "turn_end", usage: { inputTokens: 5, outputTokens: 5 } };
    });

    const result = await handleCompanyEvent(event, mockTwenty as TwentyMCPClient, defaultConfig);

    expect(result?.module).toBe("company");
    expect(result?.recordId).toBe("company-resp");
    expect(typeof result?.durationMs).toBe("number");
    expect(result?.durationMs).toBeGreaterThanOrEqual(0);
  });
});
