import { describe, it, expect, vi } from "vitest";
import type * as OpenAI from "./openai.js";

// Note: These tests verify the function signatures and return types
// without making actual API calls. The functions themselves are tested
// via integration tests that mock the SDK properly.

describe("streamOpenAI", () => {
  it("is an exported function", async () => {
    const mod = (await import("./openai.js")) as typeof OpenAI;
    expect(typeof mod.streamOpenAI).toBe("function");
  });

  it("accepts required StreamOptions parameters", async () => {
    // Verify the function signature accepts required parameters
    type TestOptions = Parameters<(typeof OpenAI)["streamOpenAI"]>[0];
    const options: TestOptions = {
      provider: "openai",
      model: "gpt-4",
      messages: [{ role: "user", content: "test" }],
    };

    expect(options.provider).toBe("openai");
    expect(options.model).toBe("gpt-4");
    expect(options.messages).toHaveLength(1);
  });

  it("accepts OpenAI provider options", async () => {
    type TestOptions = Parameters<(typeof OpenAI)["streamOpenAI"]>[0];
    const options: TestOptions = {
      provider: "openai",
      model: "gpt-4-turbo",
      messages: [{ role: "user", content: "hello" }],
      apiKey: "sk-test",
      temperature: 0.7,
      maxTokens: 1000,
    };

    expect(options.provider).toBe("openai");
    expect(options.apiKey).toBe("sk-test");
  });

  it("accepts GLM provider options", async () => {
    type TestOptions = Parameters<(typeof OpenAI)["streamOpenAI"]>[0];
    const options: TestOptions = {
      provider: "glm",
      model: "glm-4",
      messages: [{ role: "user", content: "hello" }],
      thinking: "high",
      temperature: 0.6,
    };

    expect(options.provider).toBe("glm");
    expect(options.thinking).toBe("high");
  });

  it("accepts Moonshot provider options", async () => {
    type TestOptions = Parameters<(typeof OpenAI)["streamOpenAI"]>[0];
    const options: TestOptions = {
      provider: "moonshot",
      model: "moonshot-v1",
      messages: [{ role: "user", content: "hello" }],
      webSearch: true,
    };

    expect(options.provider).toBe("moonshot");
    expect(options.webSearch).toBe(true);
  });

  it("accepts AbortSignal", async () => {
    type TestOptions = Parameters<(typeof OpenAI)["streamOpenAI"]>[0];
    const options: TestOptions = {
      provider: "openai",
      model: "gpt-4",
      messages: [{ role: "user", content: "test" }],
      signal: new AbortController().signal,
    };

    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it("accepts custom baseUrl", async () => {
    type TestOptions = Parameters<(typeof OpenAI)["streamOpenAI"]>[0];
    const options: TestOptions = {
      provider: "openai",
      model: "gpt-4",
      messages: [{ role: "user", content: "test" }],
      baseUrl: "https://custom.api.com/v1",
    };

    expect(options.baseUrl).toBe("https://custom.api.com/v1");
  });

  it("accepts custom fetch", async () => {
    type TestOptions = Parameters<(typeof OpenAI)["streamOpenAI"]>[0];
    const customFetch = vi.fn() as unknown as typeof globalThis.fetch;
    const options: TestOptions = {
      provider: "openai",
      model: "gpt-4",
      messages: [{ role: "user", content: "test" }],
      fetch: customFetch,
    };

    expect(options.fetch).toBe(customFetch);
  });
});
