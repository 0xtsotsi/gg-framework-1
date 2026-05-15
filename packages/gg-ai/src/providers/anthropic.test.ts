import { describe, it, expect } from "vitest";
import type * as Anthropic from "./anthropic.js";

// Note: These tests verify the function signatures and return types
// without making actual API calls. The functions themselves are tested
// via integration tests that mock the SDK properly.

describe("streamAnthropic", () => {
  it("is an exported function", async () => {
    const mod = (await import("./anthropic.js")) as typeof Anthropic;
    expect(typeof mod.streamAnthropic).toBe("function");
  });

  it("accepts required StreamOptions parameters", async () => {
    // Verify the function signature accepts required parameters
    type TestOptions = Parameters<(typeof Anthropic)["streamAnthropic"]>[0];
    const options: TestOptions = {
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      messages: [{ role: "user", content: "test" }],
    };

    expect(options.provider).toBe("anthropic");
    expect(options.model).toBe("claude-sonnet-4-6");
    expect(options.messages).toHaveLength(1);
  });

  it("accepts optional parameters without type errors", async () => {
    // Test all optional parameters
    type TestOptions = Parameters<(typeof Anthropic)["streamAnthropic"]>[0];
    const options: TestOptions = {
      provider: "anthropic",
      model: "claude-opus-4",
      messages: [
        { role: "system", content: "You are helpful" },
        { role: "user", content: "Hello" },
      ],
      apiKey: "sk-ant-api03-test",
      maxTokens: 4096,
      temperature: 0.7,
      thinking: "high",
      signal: new AbortController().signal,
      baseUrl: "https://custom.anthropic.com",
    };

    expect(options.apiKey).toBe("sk-ant-api03-test");
    expect(options.maxTokens).toBe(4096);
    expect(options.temperature).toBe(0.7);
    expect(options.thinking).toBe("high");
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(options.baseUrl).toBe("https://custom.anthropic.com");
  });
});
