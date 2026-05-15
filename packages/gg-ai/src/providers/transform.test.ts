import { describe, it, expect } from "vitest";
import {
  toAnthropicCacheControl,
  toAnthropicMessages,
  toAnthropicTools,
  toAnthropicToolChoice,
  toAnthropicThinking,
  normalizeAnthropicStopReason,
  toOpenAIMessages,
  toOpenAITools,
  toOpenAIToolChoice,
  toOpenAIReasoningEffort,
  normalizeOpenAIStopReason,
} from "./transform.js";
import { z } from "zod";
import type { Message, Tool } from "../types.js";

// ── Test Fixtures ───────────────────────────────────────────

function makeTextPart(text: string) {
  return { type: "text" as const, text };
}

function makeToolCall(id: string, name: string, args: Record<string, unknown>) {
  return { type: "tool_call" as const, id, name, args };
}

function makeThinking(text: string, signature = "sig1") {
  return { type: "thinking" as const, text, signature };
}

function makeServerToolCall(id: string, name: string, input: unknown) {
  return { type: "server_tool_call" as const, id, name, input };
}

function makeToolResult(toolCallId: string, content: string, isError = false) {
  return { type: "tool_result" as const, toolCallId, content, isError };
}

const simpleTool: Tool = {
  name: "read",
  description: "Read a file",
  parameters: z.object({
    path: z.string(),
  }),
};

// ── toAnthropicCacheControl ──────────────────────────────────

describe("toAnthropicCacheControl", () => {
  it("returns undefined for retention=none", () => {
    expect(toAnthropicCacheControl("none", undefined)).toBeUndefined();
  });

  it("returns short cache by default", () => {
    const result = toAnthropicCacheControl("short", undefined);
    expect(result).toEqual({ type: "ephemeral" });
  });

  it("returns 1h TTL for long retention on Anthropic API", () => {
    const result = toAnthropicCacheControl("long", "https://api.anthropic.com/v1");
    expect(result).toEqual({ type: "ephemeral", ttl: "1h" });
  });

  it("returns no TTL for long retention on custom baseUrl", () => {
    const result = toAnthropicCacheControl("long", "https://custom.provider.com");
    expect(result).toEqual({ type: "ephemeral" });
  });

  it("defaults to short for undefined retention", () => {
    const result = toAnthropicCacheControl(undefined, undefined);
    expect(result).toEqual({ type: "ephemeral" });
  });
});

// ── toAnthropicMessages ─────────────────────────────────────

describe("toAnthropicMessages", () => {
  it("converts system message to system blocks", () => {
    const messages: Message[] = [
      { role: "system", content: "You are helpful." },
      { role: "user", content: "Hello" },
    ];
    const result = toAnthropicMessages(messages);
    expect(result.system).toBeDefined();
    expect(result.system![0]).toMatchObject({ type: "text", text: "You are helpful." });
    expect(result.messages).toHaveLength(1);
  });

  it("converts string user content", () => {
    const messages: Message[] = [{ role: "user", content: "Hello world" }];
    const result = toAnthropicMessages(messages);
    expect(result.messages[0]).toMatchObject({ role: "user", content: "Hello world" });
  });

  it("converts text+image user content parts", () => {
    const messages: Message[] = [
      {
        role: "user",
        content: [
          { type: "text", text: "Look at this" },
          { type: "image", mediaType: "image/jpeg", data: "base64data" },
        ],
      },
    ];
    const result = toAnthropicMessages(messages);
    const userContent = result.messages[0]!.content as unknown[];
    expect(userContent).toHaveLength(2);
    expect(userContent[0]).toMatchObject({ type: "text", text: "Look at this" });
    expect(userContent[1]).toMatchObject({
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: "base64data" },
    });
  });

  it("converts assistant text content", () => {
    const messages: Message[] = [{ role: "assistant", content: "I can help." }];
    const result = toAnthropicMessages(messages);
    expect(result.messages[0]).toMatchObject({
      role: "assistant",
      content: "I can help.",
    });
  });

  it("converts assistant content parts", () => {
    const messages: Message[] = [
      {
        role: "assistant",
        content: [makeTextPart("Hello"), makeThinking("thinking text", "sig")],
      },
    ];
    const result = toAnthropicMessages(messages);
    const content = result.messages[0]!.content as unknown[];
    expect(content).toHaveLength(2);
    expect(content[0]).toMatchObject({ type: "text", text: "Hello" });
    expect(content[1]).toMatchObject({
      type: "thinking",
      thinking: "thinking text",
      signature: "sig",
    });
  });

  it("strips thinking blocks without signature", () => {
    const messages: Message[] = [
      {
        role: "assistant",
        content: [
          // No signature = stripped
          { type: "thinking", text: "no sig", signature: undefined },
          makeTextPart("with text"),
        ],
      },
    ];
    const result = toAnthropicMessages(messages);
    const content = result.messages[0]!.content as unknown[];
    // thinking without signature is stripped, only text remains
    expect(content).toHaveLength(1);
    expect(content[0]).toMatchObject({ type: "text", text: "with text" });
  });

  it("strips empty text blocks", () => {
    const messages: Message[] = [
      {
        role: "assistant",
        content: [makeTextPart(""), makeTextPart("real text")],
      },
    ];
    const result = toAnthropicMessages(messages);
    const content = result.messages[0]!.content as unknown[];
    expect(content).toHaveLength(1);
    expect(content[0]).toMatchObject({ type: "text", text: "real text" });
  });

  it("converts tool_use to tool_use blocks", () => {
    const messages: Message[] = [
      { role: "assistant", content: [makeToolCall("tc1", "read", { path: "foo.ts" })] },
    ];
    const result = toAnthropicMessages(messages);
    const content = result.messages[0]!.content as unknown[];
    expect(content[0]).toMatchObject({
      type: "tool_use",
      id: "tc1",
      name: "read",
      input: { path: "foo.ts" },
    });
  });

  it("converts server_tool_call", () => {
    const messages: Message[] = [
      { role: "assistant", content: [makeServerToolCall("sv1", "web_search", { query: "test" })] },
    ];
    const result = toAnthropicMessages(messages);
    const content = result.messages[0]!.content as unknown[];
    expect(content[0]).toMatchObject({
      type: "server_tool_use",
      id: "sv1",
      name: "web_search",
      input: { query: "test" },
    });
  });

  it("converts tool results", () => {
    const messages: Message[] = [
      { role: "tool", content: [makeToolResult("tc1", "file contents", false)] },
    ];
    const result = toAnthropicMessages(messages);
    expect(result.messages[0]).toMatchObject({
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: "tc1",
          content: "file contents",
          is_error: false,
        },
      ],
    });
  });

  it("adds cache_control to last user message when cacheControl set", () => {
    const messages: Message[] = [
      { role: "system", content: "sys" },
      { role: "user", content: "hello" },
    ];
    const result = toAnthropicMessages(messages, { type: "ephemeral", ttl: "1h" });
    const userContent = result.messages[0]!.content;
    if (typeof userContent === "string") {
      expect(result.messages[0]).toMatchObject({
        role: "user",
        content: [{ type: "text", text: "hello", cache_control: { type: "ephemeral", ttl: "1h" } }],
      });
    }
  });

  it("splits system on uncached marker", () => {
    const messages: Message[] = [
      {
        role: "system",
        content: "Cached part\n<!-- uncached -->\nUncached part",
      },
      { role: "user", content: "test" },
    ];
    const result = toAnthropicMessages(messages, { type: "ephemeral", ttl: "1h" });
    expect(result.system).toHaveLength(2);
    expect(result.system![0]).toMatchObject({
      type: "text",
      text: "Cached part",
      cache_control: { type: "ephemeral", ttl: "1h" },
    });
    expect(result.system![1]).toMatchObject({
      type: "text",
      text: "Uncached part",
    });
  });
});

// ── toAnthropicTools ────────────────────────────────────────

describe("toAnthropicTools", () => {
  it("converts tool to Anthropic format", () => {
    const result = toAnthropicTools([simpleTool]);
    expect(result[0]).toMatchObject({
      name: "read",
      description: "Read a file",
    });
  });

  it("uses rawInputSchema when available", () => {
    const toolWithRawSchema: Tool = {
      name: "raw_tool",
      description: "raw schema tool",
      parameters: z.object({ x: z.string() }),
      rawInputSchema: { type: "object", properties: { x: { type: "string" } }, required: ["x"] },
    };
    const result = toAnthropicTools([toolWithRawSchema]);
    expect(result[0].input_schema).toEqual({
      type: "object",
      properties: { x: { type: "string" } },
      required: ["x"],
    });
  });
});

// ── toAnthropicToolChoice ───────────────────────────────────

describe("toAnthropicToolChoice", () => {
  it('returns { type: "auto" } for "auto"', () => {
    expect(toAnthropicToolChoice("auto")).toEqual({ type: "auto" });
  });

  it('returns { type: "none" } for "none"', () => {
    expect(toAnthropicToolChoice("none")).toEqual({ type: "none" });
  });

  it('returns { type: "any" } for "required"', () => {
    expect(toAnthropicToolChoice("required")).toEqual({ type: "any" });
  });

  it("returns named tool choice", () => {
    expect(toAnthropicToolChoice({ name: "read" })).toEqual({ type: "tool", name: "read" });
  });
});

// ── toAnthropicThinking ─────────────────────────────────────

describe("toAnthropicThinking", () => {
  it("returns adaptive thinking for Opus 4.6", () => {
    const result = toAnthropicThinking("medium", 4096, "claude-opus-4-6-20250514");
    expect(result).toMatchObject({
      thinking: { type: "adaptive" },
      outputConfig: { effort: "medium" },
    });
  });

  it("returns adaptive thinking for Sonnet 4.6", () => {
    const result = toAnthropicThinking("high", 4096, "claude-sonnet-4-6-20250514");
    expect(result).toMatchObject({
      thinking: { type: "adaptive" },
      outputConfig: { effort: "high" },
    });
  });

  it("downgrades max to high for Sonnet", () => {
    const result = toAnthropicThinking("max", 4096, "claude-sonnet-4-6-20250514");
    expect(result.outputConfig).toEqual({ effort: "high" });
  });

  it("uses budget-based thinking for older models", () => {
    const result = toAnthropicThinking("medium", 8192, "claude-3-5-sonnet-20241022");
    expect(result).toMatchObject({
      thinking: { type: "enabled", budget_tokens: 4096 },
    });
  });

  it("max is treated as high on legacy models", () => {
    const result = toAnthropicThinking("max", 8192, "claude-3-5-sonnet-20241022");
    expect(result.thinking).toMatchObject({ type: "enabled", budget_tokens: 8192 });
  });

  it("low uses 25% of maxTokens", () => {
    const result = toAnthropicThinking("low", 4096, "claude-3-5-sonnet-20241022");
    expect(result.thinking).toMatchObject({ type: "enabled", budget_tokens: 1024 });
  });
});

// ── normalizeAnthropicStopReason ────────────────────────────

describe("normalizeAnthropicStopReason", () => {
  it("maps tool_use correctly", () => {
    expect(normalizeAnthropicStopReason("tool_use")).toBe("tool_use");
  });

  it("maps max_tokens", () => {
    expect(normalizeAnthropicStopReason("max_tokens")).toBe("max_tokens");
  });

  it("maps pause_turn", () => {
    expect(normalizeAnthropicStopReason("pause_turn")).toBe("pause_turn");
  });

  it("maps stop_sequence", () => {
    expect(normalizeAnthropicStopReason("stop_sequence")).toBe("stop_sequence");
  });

  it("maps refusal", () => {
    expect(normalizeAnthropicStopReason("refusal")).toBe("refusal");
  });

  it("defaults to end_turn for unknown", () => {
    expect(normalizeAnthropicStopReason(null)).toBe("end_turn");
    expect(normalizeAnthropicStopReason("unknown")).toBe("end_turn");
  });
});

// ── toOpenAIMessages ────────────────────────────────────────

describe("toOpenAIMessages", () => {
  it("converts system message", () => {
    const messages: Message[] = [
      { role: "system", content: "You are helpful." },
      { role: "user", content: "hello" },
    ];
    const result = toOpenAIMessages(messages);
    expect(result[0]).toMatchObject({ role: "system", content: "You are helpful." });
  });

  it("converts string user content", () => {
    const messages: Message[] = [{ role: "user", content: "hello" }];
    const result = toOpenAIMessages(messages);
    expect(result[0]).toMatchObject({ role: "user", content: "hello" });
  });

  it("converts image+text user content parts", () => {
    const messages: Message[] = [
      {
        role: "user",
        content: [
          { type: "text", text: "Describe" },
          { type: "image", mediaType: "image/png", data: "abc123" },
        ],
      },
    ];
    const result = toOpenAIMessages(messages);
    const content = result[0]!.content as unknown[];
    expect(content).toHaveLength(2);
    expect(content[1]).toMatchObject({
      type: "image_url",
      image_url: { url: "data:image/png;base64,abc123" },
    });
  });

  it("remaps toolu_* IDs to call_* prefix", () => {
    const messages: Message[] = [
      {
        role: "assistant",
        content: [makeToolCall("toolu_abc123", "read", { path: "foo.ts" })],
      },
    ];
    const result = toOpenAIMessages(messages);
    const toolCalls = (result[0] as unknown as { tool_calls: unknown[] }).tool_calls;
    expect(toolCalls[0]).toMatchObject({ id: "call_abc123" });
  });

  it("keeps call_* prefixed IDs unchanged", () => {
    const messages: Message[] = [
      {
        role: "assistant",
        content: [makeToolCall("call_xyz789", "read", { path: "foo.ts" })],
      },
    ];
    const result = toOpenAIMessages(messages);
    const toolCalls = (result[0] as unknown as { tool_calls: unknown[] }).tool_calls;
    expect(toolCalls[0]).toMatchObject({ id: "call_xyz789" });
  });

  it("converts tool result messages with remapped IDs", () => {
    const messages: Message[] = [
      { role: "tool", content: [makeToolResult("toolu_abc123", "file contents")] },
    ];
    const result = toOpenAIMessages(messages);
    expect(result[0]).toMatchObject({
      role: "tool",
      tool_call_id: "call_abc123",
      content: "file contents",
    });
  });

  it("includes reasoning_content for thinking parts", () => {
    const messages: Message[] = [
      {
        role: "assistant",
        content: [makeThinking("thinking text", "sig")],
      },
    ];
    const result = toOpenAIMessages(messages);
    const msg = result[0] as unknown as Record<string, unknown>;
    expect(msg.reasoning_content).toBe("thinking text");
  });

  it("GLM: merges user text into last tool message", () => {
    const messages: Message[] = [
      { role: "tool", content: [makeToolResult("tc1", "result")] },
      { role: "user", content: "follow-up" },
    ];
    const result = toOpenAIMessages(messages, { provider: "glm" });
    // The follow-up should be merged into the tool message
    const lastMsg = result[result.length - 1] as unknown as Record<string, unknown>;
    expect(lastMsg.role).toBe("tool");
    expect(lastMsg.content).toContain("\n\nfollow-up");
  });

  it("non-GLM: does not merge user text", () => {
    const messages: Message[] = [
      { role: "tool", content: [makeToolResult("tc1", "result")] },
      { role: "user", content: "follow-up" },
    ];
    const result = toOpenAIMessages(messages, { provider: "openai" });
    const lastMsg = result[result.length - 1] as unknown as Record<string, unknown>;
    expect(lastMsg.role).toBe("user");
  });
});

// ── toOpenAITools ───────────────────────────────────────────

describe("toOpenAITools", () => {
  it("converts tool to OpenAI function format", () => {
    const result = toOpenAITools([simpleTool]);
    expect(result[0]).toEqual({
      type: "function",
      function: {
        name: "read",
        description: "Read a file",
        parameters: expect.objectContaining({ type: "object" }),
      },
    });
  });

  it("uses rawInputSchema when available", () => {
    const toolWithRaw: Tool = {
      name: "raw",
      description: "desc",
      parameters: z.object({ x: z.string() }),
      rawInputSchema: { type: "object", properties: { x: { type: "string" } }, required: ["x"] },
    };
    const result = toOpenAITools([toolWithRaw]);
    const fnTool = result[0] as { function: { parameters: object } };
    expect(fnTool.function.parameters).toEqual({
      type: "object",
      properties: { x: { type: "string" } },
      required: ["x"],
    });
  });
});

// ── toOpenAIToolChoice ──────────────────────────────────────

describe("toOpenAIToolChoice", () => {
  it('returns "auto" for "auto"', () => {
    expect(toOpenAIToolChoice("auto")).toBe("auto");
  });

  it('returns "none" for "none"', () => {
    expect(toOpenAIToolChoice("none")).toBe("none");
  });

  it('returns "required" for "required"', () => {
    expect(toOpenAIToolChoice("required")).toBe("required");
  });

  it("returns named function choice", () => {
    expect(toOpenAIToolChoice({ name: "read" })).toEqual({
      type: "function",
      function: { name: "read" },
    });
  });
});

// ── toOpenAIReasoningEffort ────────────────────────────────

describe("toOpenAIReasoningEffort", () => {
  it("maps low/medium/high directly", () => {
    expect(toOpenAIReasoningEffort("low")).toBe("low");
    expect(toOpenAIReasoningEffort("medium")).toBe("medium");
    expect(toOpenAIReasoningEffort("high")).toBe("high");
  });

  it("maps max to high", () => {
    expect(toOpenAIReasoningEffort("max")).toBe("high");
  });
});

// ── normalizeOpenAIStopReason ──────────────────────────────

describe("normalizeOpenAIStopReason", () => {
  it("maps tool_calls to tool_use", () => {
    expect(normalizeOpenAIStopReason("tool_calls")).toBe("tool_use");
  });

  it("maps length to max_tokens", () => {
    expect(normalizeOpenAIStopReason("length")).toBe("max_tokens");
  });

  it("maps stop to stop_sequence", () => {
    expect(normalizeOpenAIStopReason("stop")).toBe("stop_sequence");
  });

  it("defaults to end_turn for null/unknown", () => {
    expect(normalizeOpenAIStopReason(null)).toBe("end_turn");
    expect(normalizeOpenAIStopReason("content_filter")).toBe("end_turn");
  });
});
