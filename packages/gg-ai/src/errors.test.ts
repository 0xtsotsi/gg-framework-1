import { describe, it, expect } from "vitest";
import { GGAIError, ProviderError } from "./errors.js";

describe("GGAIError", () => {
  it("has correct name", () => {
    const err = new GGAIError("something went wrong");
    expect(err.name).toBe("GGAIError");
  });

  it("has correct message", () => {
    const err = new GGAIError("something went wrong");
    expect(err.message).toBe("something went wrong");
  });

  it("is an instance of Error", () => {
    const err = new GGAIError("test");
    expect(err).toBeInstanceOf(Error);
  });

  it("is an instance of GGAIError", () => {
    const err = new GGAIError("test");
    expect(err).toBeInstanceOf(GGAIError);
  });

  it("accepts cause option", () => {
    const cause = new Error("original cause");
    const err = new GGAIError("with cause", { cause });
    expect(err.cause).toBe(cause);
  });

  it("can be thrown and caught", () => {
    expect(() => {
      throw new GGAIError("thrown");
    }).toThrow("thrown");
  });
});

describe("ProviderError", () => {
  it("has correct name", () => {
    const err = new ProviderError("anthropic", "api key invalid");
    expect(err.name).toBe("ProviderError");
  });

  it("prefixes message with provider name", () => {
    const err = new ProviderError("anthropic", "api key invalid");
    expect(err.message).toBe("[anthropic] api key invalid");
  });

  it("is an instance of Error", () => {
    const err = new ProviderError("openai", "rate limited");
    expect(err).toBeInstanceOf(Error);
  });

  it("is an instance of GGAIError (extends GGAIError)", () => {
    const err = new ProviderError("openai", "rate limited");
    expect(err).toBeInstanceOf(GGAIError);
  });

  it("stores provider name", () => {
    const err = new ProviderError("moonshot", "server error");
    expect((err as unknown as { provider: string }).provider).toBe("moonshot");
  });

  it("stores status code", () => {
    const err = new ProviderError("openai", "bad request", { statusCode: 400 });
    expect((err as unknown as { statusCode: number }).statusCode).toBe(400);
  });

  it("stores undefined status code when not provided", () => {
    const err = new ProviderError("anthropic", "timeout");
    expect((err as unknown as { statusCode: number | undefined }).statusCode).toBeUndefined();
  });

  it("accepts cause option", () => {
    const cause = new Error("network error");
    const err = new ProviderError("anthropic", "failed", { cause });
    expect(err.cause).toBe(cause);
  });

  it("formats message correctly with status code", () => {
    const err = new ProviderError("openai", "not found", { statusCode: 404 });
    expect(err.message).toBe("[openai] not found");
    expect((err as unknown as { statusCode: number }).statusCode).toBe(404);
  });

  it("can be thrown and caught", () => {
    expect(() => {
      throw new ProviderError("glm", "unauthorized");
    }).toThrow("[glm] unauthorized");
  });

  it("catch block can access both GGAIError and ProviderError properties", () => {
    let caughtProvider: string | undefined;
    let caughtMessage: string;

    try {
      throw new ProviderError("anthropic", "auth failed");
    } catch (e) {
      const err = e as ProviderError;
      caughtProvider = err.provider;
      caughtMessage = err.message;
    }
    expect(caughtProvider).toBe("anthropic");
    expect(caughtMessage).toBe("[anthropic] auth failed");
  });

  describe("error hierarchy", () => {
    it("GGAIError is the base class", () => {
      const baseErr = new GGAIError("base");
      expect(baseErr).toBeInstanceOf(GGAIError);
      expect(baseErr).not.toBeInstanceOf(ProviderError);
    });

    it("ProviderError extends GGAIError", () => {
      const provErr = new ProviderError("openai", "prov");
      expect(provErr).toBeInstanceOf(GGAIError);
      expect(provErr).toBeInstanceOf(ProviderError);
    });

    it("errors can be chained via cause", () => {
      const original = new Error("network failure");
      const provErr = new ProviderError("anthropic", "request failed", { cause: original });
      const baseErr = new GGAIError("top-level", { cause: provErr });

      expect(baseErr.cause).toBe(provErr);
      expect((baseErr.cause as ProviderError).cause).toBe(original);
    });

    it("can distinguish base error from provider error", () => {
      const baseErr = new GGAIError("base error");
      const provErr = new ProviderError("openai", "provider error");

      // Both are GGAIError
      expect(baseErr).toBeInstanceOf(GGAIError);
      expect(provErr).toBeInstanceOf(GGAIError);

      // Only provider error has provider property
      expect((baseErr as unknown as { provider?: string }).provider).toBeUndefined();
      expect((provErr as unknown as { provider: string }).provider).toBe("openai");
    });
  });
});
