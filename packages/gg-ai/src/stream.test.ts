import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { StreamResult } from "./utils/event-stream.js";

// Create mock StreamResult - defined outside vi.mock so it can be referenced
function createMockStreamResult(): StreamResult {
  const events = {
    push: vi.fn(),
    close: vi.fn(),
    abort: vi.fn(),
  };

  const responsePromise = Promise.resolve({
    message: { role: "assistant" as const, content: "test response" },
    stopReason: "end_turn",
    usage: { inputTokens: 10, outputTokens: 20 },
  });

  const result = {
    events,
    response: responsePromise,
    push: events.push,
    complete: vi.fn(),
    abort: events.abort,
    [Symbol.asyncIterator]: async function* () {
      yield { type: "done" as const };
    },
    then: function (
      onfulfilled?: (value: {
        message: { role: "assistant"; content: string };
        stopReason: string;
        usage: { inputTokens: number; outputTokens: number };
      }) => unknown,
      onrejected?: (reason: unknown) => unknown,
    ) {
      return responsePromise.then(onfulfilled, onrejected);
    },
  };

  return result as unknown as StreamResult;
}

// Use vi.hoisted so mocks are initialized before hoisting
const { mockProviders, mockStreamAnthropic, mockStreamOpenAI, mockStreamOpenAICodex } = vi.hoisted(
  () => {
    const providers = new Map<string, { stream: (options: unknown) => StreamResult }>();
    return {
      mockProviders: providers,
      mockStreamAnthropic: vi.fn<() => StreamResult>(),
      mockStreamOpenAI: vi.fn<() => StreamResult>(),
      mockStreamOpenAICodex: vi.fn<() => StreamResult>(),
    };
  },
);

// Mock the provider registry - we control what's registered
vi.mock("./provider-registry", () => ({
  providerRegistry: {
    register: vi.fn((name: string, entry: { stream: (options: unknown) => StreamResult }) =>
      mockProviders.set(name, entry),
    ),
    unregister: vi.fn((name: string) => mockProviders.delete(name)),
    get: vi.fn((name: string) => mockProviders.get(name)),
    has: vi.fn((name: string) => mockProviders.has(name)),
    list: vi.fn(() => ["anthropic", "openai", "glm", "moonshot"]),
  },
}));

// Mock the built-in providers
vi.mock("./providers/anthropic", () => ({
  streamAnthropic: mockStreamAnthropic,
}));

vi.mock("./providers/openai", () => ({
  streamOpenAI: mockStreamOpenAI,
}));

vi.mock("./providers/openai-codex", () => ({
  streamOpenAICodex: mockStreamOpenAICodex,
}));

// Import stream after mocks
import { stream } from "./stream.js";
import { providerRegistry } from "./provider-registry.js";

describe("stream()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProviders.clear();
  });

  afterEach(() => {
    mockProviders.clear();
  });

  const baseOptions = {
    model: "test-model",
    messages: [{ role: "user" as const, content: "hello" }],
  };

  it("throws error for unknown provider", () => {
    expect(() => stream({ ...baseOptions, provider: "unknown" as never })).toThrow(
      /Unknown provider/,
    );
  });

  it("throws error listing registered providers in the message", () => {
    expect(() => stream({ ...baseOptions, provider: "unknown" as never })).toThrow(
      /anthropic.*openai|openai.*anthropic/,
    );
  });

  it("dispatches to registered custom provider", async () => {
    const customStream = vi.fn(() => createMockStreamResult());
    providerRegistry.register("custom", { stream: customStream });

    const result = stream({ ...baseOptions, provider: "custom" as never });
    await result.response;
    expect(customStream).toHaveBeenCalledOnce();
  });

  it("passes stream options to the registered provider", async () => {
    const testStream = vi.fn(() => createMockStreamResult());
    providerRegistry.register("test", { stream: testStream });

    stream({
      provider: "test" as never,
      model: "gpt-4",
      messages: [{ role: "user", content: "test" }],
      temperature: 0.7,
      maxTokens: 100,
    });
    await new Promise((r) => setTimeout(r, 10));
    expect(testStream).toHaveBeenCalledWith(
      expect.objectContaining({
        temperature: 0.7,
        maxTokens: 100,
      }),
    );
  });

  it("returns a result that is both async iterable and thenable", async () => {
    const testStream = vi.fn(() => createMockStreamResult());
    providerRegistry.register("dual", { stream: testStream });

    const result = stream({ ...baseOptions, provider: "dual" as never });

    // Check async iterator
    expect(typeof result[Symbol.asyncIterator]).toBe("function");

    // Check thenable by awaiting it
    const response = await result;
    expect(response).toBeDefined();
    expect(response.message).toBeDefined();
  });
});
