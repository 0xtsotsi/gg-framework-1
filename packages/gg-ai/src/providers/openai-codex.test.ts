import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { streamOpenAICodex } from "./openai-codex.js";
import type { StreamOptions } from "../types.js";

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("streamOpenAICodex", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    mockFetch.mockReset();
  });

  const baseOptions: StreamOptions = {
    provider: "openai",
    model: "codex-spark",
    messages: [{ role: "user", content: "hello" }],
    apiKey: "sk-test-token",
  };

  const mockSuccessfulResponse = (events: Record<string, unknown>[] = []) => {
    let index = 0;
    const body = {
      getReader: () => ({
        read: async () => {
          if (index < events.length) {
            const event = events[index++];
            return {
              done: false,
              value: new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`),
            };
          }
          return { done: true };
        },
        releaseLock: () => {},
      }),
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      body,
    });
  };

  it("is an exported function", () => {
    expect(typeof streamOpenAICodex).toBe("function");
  });

  it("returns an object with expected StreamResult interface", () => {
    mockSuccessfulResponse([]);
    const result = streamOpenAICodex(baseOptions);

    expect(result).toBeDefined();
    expect(typeof result.push).toBe("function");
    expect(typeof result.complete).toBe("function");
    expect(typeof result.abort).toBe("function");
    expect(typeof result.response).toBe("object");
    expect(result.response).toBeInstanceOf(Promise);
    expect(typeof result.then).toBe("function");
    expect(typeof result[Symbol.asyncIterator]).toBe("function");
  });

  it("uses the correct default base URL", async () => {
    mockSuccessfulResponse([
      { type: "response.done", response: { status: "completed", usage: {} } },
    ]);

    streamOpenAICodex(baseOptions);
    await new Promise((r) => setTimeout(r, 10));

    expect(mockFetch).toHaveBeenCalledWith(
      "https://chatgpt.com/backend-api/codex/responses",
      expect.any(Object),
    );
  });

  it("uses custom baseUrl when provided", async () => {
    mockSuccessfulResponse([
      { type: "response.done", response: { status: "completed", usage: {} } },
    ]);

    streamOpenAICodex({
      ...baseOptions,
      baseUrl: "https://custom.codex.com",
    });
    await new Promise((r) => setTimeout(r, 10));

    expect(mockFetch).toHaveBeenCalledWith(
      "https://custom.codex.com/codex/responses",
      expect.any(Object),
    );
  });

  it("strips trailing slashes from baseUrl", async () => {
    mockSuccessfulResponse([
      { type: "response.done", response: { status: "completed", usage: {} } },
    ]);

    streamOpenAICodex({
      ...baseOptions,
      baseUrl: "https://custom.codex.com/",
    });
    await new Promise((r) => setTimeout(r, 10));

    expect(mockFetch).toHaveBeenCalledWith(
      "https://custom.codex.com/codex/responses",
      expect.any(Object),
    );
  });

  it("sends Authorization header with Bearer token", async () => {
    mockSuccessfulResponse([
      { type: "response.done", response: { status: "completed", usage: {} } },
    ]);

    streamOpenAICodex({ ...baseOptions, apiKey: "my-secret-key" });
    await new Promise((r) => setTimeout(r, 10));

    const [, options] = mockFetch.mock.calls[0] as [string, { headers: Record<string, string> }];
    expect(options.headers.Authorization).toBe("Bearer my-secret-key");
  });

  it("sends accountId header when provided", async () => {
    mockSuccessfulResponse([
      { type: "response.done", response: { status: "completed", usage: {} } },
    ]);

    streamOpenAICodex({ ...baseOptions, accountId: "acct_12345" });
    await new Promise((r) => setTimeout(r, 10));

    const [, options] = mockFetch.mock.calls[0] as [string, { headers: Record<string, string> }];
    expect(options.headers["chatgpt-account-id"]).toBe("acct_12345");
  });

  it("sends correct headers for SSE streaming", async () => {
    mockSuccessfulResponse([
      { type: "response.done", response: { status: "completed", usage: {} } },
    ]);

    streamOpenAICodex(baseOptions);
    await new Promise((r) => setTimeout(r, 10));

    const [, options] = mockFetch.mock.calls[0] as [string, { headers: Record<string, string> }];
    expect(options.headers["Content-Type"]).toBe("application/json");
    expect(options.headers["Accept"]).toBe("text/event-stream");
    expect(options.headers["OpenAI-Beta"]).toBe("responses=experimental");
  });

  it("handles text_delta events", async () => {
    mockSuccessfulResponse([
      { type: "response.output_text.delta", delta: "Hello" },
      { type: "response.output_text.delta", delta: " World" },
      { type: "response.done", response: { status: "completed", usage: {} } },
    ]);

    const result = streamOpenAICodex(baseOptions);
    const events: unknown[] = [];
    for await (const event of result) {
      events.push(event);
    }

    expect(events).toContainEqual({ type: "text_delta", text: "Hello" });
    expect(events).toContainEqual({ type: "text_delta", text: " World" });
  });

  it("handles thinking_delta events", async () => {
    mockSuccessfulResponse([
      { type: "response.reasoning_summary_text.delta", delta: "Let me think..." },
      { type: "response.done", response: { status: "completed", usage: {} } },
    ]);

    const result = streamOpenAICodex(baseOptions);
    const events: unknown[] = [];
    for await (const event of result) {
      events.push(event);
    }

    expect(events).toContainEqual({ type: "thinking_delta", text: "Let me think..." });
  });

  it("handles tool call events", async () => {
    mockSuccessfulResponse([
      {
        type: "response.output_item.added",
        item: {
          type: "function_call",
          call_id: "fc_123",
          id: "item_456",
          name: "get_weather",
          arguments: '{"location',
        },
      },
      {
        type: "response.function_call_arguments.delta",
        delta: ': "Boston"}',
        item_id: "item_456",
      },
      {
        type: "response.output_item.done",
        item: {
          type: "function_call",
          call_id: "fc_123",
          id: "item_456",
          name: "get_weather",
          arguments: '{"location": "Boston"}',
        },
      },
      { type: "response.done", response: { status: "completed", usage: {} } },
    ]);

    const result = streamOpenAICodex(baseOptions);
    const events: unknown[] = [];
    for await (const event of result) {
      events.push(event);
    }

    expect(events.some((e: unknown) => (e as { type: string }).type === "toolcall_delta")).toBe(
      true,
    );
    expect(events.some((e: unknown) => (e as { type: string }).type === "toolcall_done")).toBe(
      true,
    );
  });

  it("throws error for non-ok responses", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: () => Promise.resolve("Unauthorized"),
    });

    const result = streamOpenAICodex(baseOptions);
    await expect(result.response).rejects.toThrow(/\[openai\]/);
    await expect(result.response).rejects.toThrow("401");
  });

  it("throws error when response body is missing", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: null,
    });

    const result = streamOpenAICodex(baseOptions);
    await expect(result.response).rejects.toThrow("No response body");
  });

  it("throws error on error events from the stream", async () => {
    mockSuccessfulResponse([{ type: "error", message: "Something went wrong" }]);

    const result = streamOpenAICodex(baseOptions);
    await expect(result.response).rejects.toThrow("Codex error: Something went wrong");
  });

  it("throws error on response.failed events", async () => {
    mockSuccessfulResponse([{ type: "response.failed", error: { message: "Request failed" } }]);

    const result = streamOpenAICodex(baseOptions);
    await expect(result.response).rejects.toThrow("Request failed");
  });

  it("adds helpful hint for subscription errors", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: () => Promise.resolve("model not supported"),
    });

    const result = streamOpenAICodex(baseOptions);
    await expect(result.response).rejects.toThrow("ChatGPT Plus");
  });

  it("sends model in request body", async () => {
    mockSuccessfulResponse([
      { type: "response.done", response: { status: "completed", usage: {} } },
    ]);

    streamOpenAICodex({ ...baseOptions, model: "codex-pro" });
    await new Promise((r) => setTimeout(r, 10));

    const [, options] = mockFetch.mock.calls[0] as [string, { body: string }];
    const body = JSON.parse(options.body);
    expect(body.model).toBe("codex-pro");
  });

  it("sends thinking config when thinking is provided", async () => {
    mockSuccessfulResponse([
      { type: "response.done", response: { status: "completed", usage: {} } },
    ]);

    streamOpenAICodex({ ...baseOptions, thinking: "high" });
    await new Promise((r) => setTimeout(r, 10));

    const [, options] = mockFetch.mock.calls[0] as [string, { body: string }];
    const body = JSON.parse(options.body);
    expect(body.reasoning).toEqual({ effort: "high", summary: "auto" });
  });

  it("passes AbortSignal to fetch", async () => {
    mockSuccessfulResponse([
      { type: "response.done", response: { status: "completed", usage: {} } },
    ]);

    const ac = new AbortController();
    streamOpenAICodex({ ...baseOptions, signal: ac.signal });
    await new Promise((r) => setTimeout(r, 10));

    const [, options] = mockFetch.mock.calls[0] as [string, { signal?: AbortSignal }];
    expect(options.signal).toBe(ac.signal);
  });

  it("maps tool_use stopReason when tool calls are present", async () => {
    mockSuccessfulResponse([
      {
        type: "response.output_item.added",
        item: {
          type: "function_call",
          call_id: "fc_123",
          id: "item_456",
          name: "test",
          arguments: "{}",
        },
      },
      {
        type: "response.output_item.done",
        item: {
          type: "function_call",
          call_id: "fc_123",
          id: "item_456",
          name: "test",
          arguments: "{}",
        },
      },
      { type: "response.done", response: { status: "completed", usage: {} } },
    ]);

    const result = streamOpenAICodex(baseOptions);
    const response = await result.response;
    expect(response.stopReason).toBe("tool_use");
  });

  it("maps end_turn stopReason when no tool calls", async () => {
    mockSuccessfulResponse([
      { type: "response.output_text.delta", delta: "Hello" },
      { type: "response.done", response: { status: "completed", usage: {} } },
    ]);

    const result = streamOpenAICodex(baseOptions);
    const response = await result.response;
    expect(response.stopReason).toBe("end_turn");
  });
});
