import { describe, it, expect } from "vitest";
import type {
  AgentEvent,
  AgentOptions,
  AgentTool,
  ToolContext,
  StructuredToolResult,
  AgentResult,
  AgentRetryEvent,
  AgentErrorEvent,
  AgentServerToolCallEvent,
} from "./types.js";
import type { Message } from "@kenkaiiii/gg-ai";
import { z } from "zod";

// ── AgentEvent Union ───────────────────────────────────────

describe("AgentEvent types", () => {
  it("AgentTextDeltaEvent has type and text", () => {
    const event: AgentEvent = { type: "text_delta", text: "Hello" };
    expect(event.type).toBe("text_delta");
    expect((event as { text: string }).text).toBe("Hello");
  });

  it("AgentThinkingDeltaEvent has type and text", () => {
    const event: AgentEvent = { type: "thinking_delta", text: "thinking..." };
    expect(event.type).toBe("thinking_delta");
  });

  it("AgentToolCallStartEvent has required fields", () => {
    const event: AgentEvent = {
      type: "tool_call_start",
      toolCallId: "tc1",
      name: "read",
      args: { path: "foo.ts" },
    };
    expect(event.type).toBe("tool_call_start");
    expect((event as { name: string }).name).toBe("read");
    expect((event as { args: unknown }).args).toEqual({ path: "foo.ts" });
  });

  it("AgentToolCallEndEvent includes isError and durationMs", () => {
    const event: AgentEvent = {
      type: "tool_call_end",
      toolCallId: "tc1",
      result: "file contents",
      isError: false,
      durationMs: 150,
    };
    expect(event.type).toBe("tool_call_end");
    expect((event as { isError: boolean }).isError).toBe(false);
    expect((event as { durationMs: number }).durationMs).toBe(150);
  });

  it("AgentRetryEvent has all retry fields", () => {
    const event: AgentEvent = {
      type: "retry",
      reason: "rate_limit",
      attempt: 2,
      maxAttempts: 5,
      delayMs: 1000,
    };
    const retry = event as AgentRetryEvent;
    expect(retry.reason).toBe("rate_limit");
    expect(retry.attempt).toBe(2);
    expect(retry.maxAttempts).toBe(5);
    expect(retry.delayMs).toBe(1000);
  });

  it("AgentErrorEvent wraps an Error", () => {
    const err = new Error("provider failure");
    const event: AgentEvent = { type: "error", error: err };
    const errorEvent = event as AgentErrorEvent;
    expect(errorEvent.error.message).toBe("provider failure");
  });

  it("AgentServerToolCallEvent has id, name, input", () => {
    const event: AgentEvent = {
      type: "server_tool_call",
      id: "sv1",
      name: "web_search",
      input: { query: "test" },
    };
    const svc = event as AgentServerToolCallEvent;
    expect(svc.name).toBe("web_search");
    expect(svc.input).toEqual({ query: "test" });
  });

  it("AgentTurnEndEvent has turn, stopReason, usage", () => {
    const event: AgentEvent = {
      type: "turn_end",
      turn: 3,
      stopReason: "tool_use",
      usage: { inputTokens: 100, outputTokens: 50 },
    };
    expect(event.type).toBe("turn_end");
    expect((event as { turn: number }).turn).toBe(3);
    expect((event as { stopReason: string }).stopReason).toBe("tool_use");
  });

  it("AgentDoneEvent has totalTurns and totalUsage", () => {
    const event: AgentEvent = {
      type: "agent_done",
      totalTurns: 5,
      totalUsage: { inputTokens: 1000, outputTokens: 500 },
    };
    expect(event.type).toBe("agent_done");
    expect((event as { totalTurns: number }).totalTurns).toBe(5);
  });
});

// ── ToolContext ─────────────────────────────────────────────

describe("ToolContext", () => {
  it("has signal, toolCallId, optional onUpdate", () => {
    const controller = new AbortController();
    const context: ToolContext = {
      signal: controller.signal,
      toolCallId: "tc-123",
      onUpdate: (update) => {
        expect(update).toBeDefined();
      },
    };
    expect(context.signal).toBe(controller.signal);
    expect(context.toolCallId).toBe("tc-123");
    expect(typeof context.onUpdate).toBe("function");
  });

  it("onUpdate is optional", () => {
    const context: ToolContext = {
      signal: new AbortController().signal,
      toolCallId: "tc-456",
    };
    expect(context.onUpdate).toBeUndefined();
  });
});

// ── AgentTool ───────────────────────────────────────────────

describe("AgentTool", () => {
  it("requires name, description, parameters, execute", () => {
    const tool: AgentTool<z.ZodObject<{ path: z.ZodString }>> = {
      name: "read",
      description: "Read file contents",
      parameters: z.object({ path: z.string() }),
      execute: async (args, _ctx) => {
        return `Contents of ${args.path}`;
      },
    };
    expect(tool.name).toBe("read");
    expect(tool.parameters).toBeDefined();
  });

  it("execute returns string", async () => {
    const tool: AgentTool<z.ZodObject<{ msg: z.ZodString }>> = {
      name: "echo",
      description: "Echo args",
      parameters: z.object({ msg: z.string() }),
      execute: async (args) => args.msg,
    };
    const result = await tool.execute(
      { msg: "test" },
      { signal: new AbortController().signal, toolCallId: "x" },
    );
    expect(result).toBe("test");
  });

  it("execute returns StructuredToolResult", async () => {
    const tool: AgentTool<z.ZodObject<{ path: z.ZodString; content: z.ZodString }>> = {
      name: "write",
      description: "Write file",
      parameters: z.object({ path: z.string(), content: z.string() }),
      execute: async (args) => ({
        content: `Wrote to ${args.path}`,
        details: { bytes: args.content.length },
      }),
    };
    const result = (await tool.execute(
      { path: "foo.txt", content: "hello" },
      { signal: new AbortController().signal, toolCallId: "x" },
    )) as StructuredToolResult;
    expect(result.content).toContain("foo.txt");
    expect(result.details).toEqual({ bytes: 5 });
  });
});

// ── AgentOptions ────────────────────────────────────────────

describe("AgentOptions", () => {
  it("required: provider and model", () => {
    const options: AgentOptions = {
      provider: "anthropic",
      model: "claude-3-5-sonnet-20241022",
    };
    expect(options.provider).toBe("anthropic");
    expect(options.model).toBe("claude-3-5-sonnet-20241022");
  });

  it("all optional fields present", () => {
    const options: AgentOptions = {
      provider: "openai",
      model: "gpt-4",
      system: "You are helpful",
      maxTokens: 4096,
      temperature: 0.7,
      thinking: "medium",
      apiKey: "sk-xxx",
      baseUrl: "https://api.openai.com/v1",
      webSearch: true,
      compaction: false,
      clearToolUses: false,
      maxToolResultChars: 10000,
      maxContinuations: 3,
      cacheRetention: "long",
      signal: new AbortController().signal,
    };
    expect(options.webSearch).toBe(true);
    expect(options.thinking).toBe("medium");
    expect(options.maxContinuations).toBe(3);
  });

  it("transformContext returns Message[] synchronously", () => {
    const options: AgentOptions = {
      provider: "anthropic",
      model: "sonnet",
      transformContext: (msgs) => msgs.slice(0, 5),
    };
    const result = options.transformContext!([{ role: "user", content: "hello" } as Message]);
    expect(result).toHaveLength(1);
  });

  it("transformContext returns Promise<Message[]> asynchronously", async () => {
    const options: AgentOptions = {
      provider: "anthropic",
      model: "sonnet",
      transformContext: async (msgs) => msgs,
    };
    const result = await options.transformContext!([{ role: "user", content: "hello" } as Message]);
    expect(result).toHaveLength(1);
  });
});

// ── AgentResult ─────────────────────────────────────────────

describe("AgentResult", () => {
  it("requires message, totalTurns, totalUsage", () => {
    const result: AgentResult = {
      message: {
        role: "assistant",
        content: "Hello, world!",
      },
      totalTurns: 3,
      totalUsage: {
        inputTokens: 500,
        outputTokens: 200,
        cacheRead: 100,
      },
    };
    expect(result.totalTurns).toBe(3);
    expect(result.totalUsage.cacheRead).toBe(100);
  });
});
