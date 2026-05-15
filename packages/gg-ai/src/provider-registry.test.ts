import { describe, it, expect, vi, beforeEach } from "vitest";
import { providerRegistry } from "./provider-registry.js";
import type { ProviderStreamFn } from "./provider-registry.js";
import { StreamResult } from "./utils/event-stream.js";

function makeStreamResult(): StreamResult {
  const result = new StreamResult();
  return Object.assign(result, {
    hasConsumer: true,
  });
}

describe("ProviderRegistry", () => {
  beforeEach(() => {
    // Clean up any custom providers added during tests
    providerRegistry.unregister("test-provider");
    providerRegistry.unregister("another-provider");
  });

  describe("register()", () => {
    it("registers a provider successfully", () => {
      const streamFn: ProviderStreamFn = () => makeStreamResult();
      providerRegistry.register("test-provider", { stream: streamFn });
      expect(providerRegistry.has("test-provider")).toBe(true);
    });

    it("overwrites an existing provider with the same name", () => {
      const stream1 = vi.fn(() => makeStreamResult());
      const stream2 = vi.fn(() => makeStreamResult());

      providerRegistry.register("overwrite-me", { stream: stream1 });
      providerRegistry.register("overwrite-me", { stream: stream2 });

      const entry = providerRegistry.get("overwrite-me");
      expect(entry?.stream).toBe(stream2);
    });
  });

  describe("get()", () => {
    it("returns the provider entry when registered", () => {
      const streamFn: ProviderStreamFn = () => makeStreamResult();
      providerRegistry.register("get-test", { stream: streamFn });

      const entry = providerRegistry.get("get-test");
      expect(entry).toBeDefined();
      expect(entry?.stream).toBe(streamFn);
    });

    it("returns undefined for unregistered provider", () => {
      const entry = providerRegistry.get("non-existent-provider");
      expect(entry).toBeUndefined();
    });
  });

  describe("has()", () => {
    it("returns true for registered providers", () => {
      providerRegistry.register("has-test", { stream: () => makeStreamResult() });
      expect(providerRegistry.has("has-test")).toBe(true);
    });

    it("returns false for unregistered providers", () => {
      expect(providerRegistry.has("definitely-does-not-exist")).toBe(false);
    });

    it("returns false after unregistering", () => {
      providerRegistry.register("will-unregister", { stream: () => makeStreamResult() });
      expect(providerRegistry.has("will-unregister")).toBe(true);
      providerRegistry.unregister("will-unregister");
      expect(providerRegistry.has("will-unregister")).toBe(false);
    });
  });

  describe("unregister()", () => {
    it("removes a registered provider", () => {
      providerRegistry.register("to-remove", { stream: () => makeStreamResult() });
      expect(providerRegistry.has("to-remove")).toBe(true);

      const removed = providerRegistry.unregister("to-remove");
      expect(removed).toBe(true);
      expect(providerRegistry.has("to-remove")).toBe(false);
    });

    it("returns false when trying to remove non-existent provider", () => {
      const removed = providerRegistry.unregister("i-dont-exist");
      expect(removed).toBe(false);
    });

    it("get returns undefined after unregister", () => {
      providerRegistry.register("get-after-unreg", { stream: () => makeStreamResult() });
      providerRegistry.unregister("get-after-unreg");
      expect(providerRegistry.get("get-after-unreg")).toBeUndefined();
    });
  });

  describe("list()", () => {
    it("lists all registered provider names", () => {
      providerRegistry.register("provider-a", { stream: () => makeStreamResult() });
      providerRegistry.register("provider-b", { stream: () => makeStreamResult() });

      const names = providerRegistry.list();
      expect(names).toContain("provider-a");
      expect(names).toContain("provider-b");
    });

    it("does not include unregistered providers", () => {
      providerRegistry.register("will-list", { stream: () => makeStreamResult() });
      providerRegistry.unregister("will-list");

      const names = providerRegistry.list();
      expect(names).not.toContain("will-list");
    });

    it("returns a new array each call (does not leak internal state)", () => {
      const list1 = providerRegistry.list();
      const list2 = providerRegistry.list();
      expect(list1).not.toBe(list2);
    });
  });

  describe("integration scenarios", () => {
    it("a newly registered provider can be retrieved", () => {
      const streamFn: ProviderStreamFn = () => makeStreamResult();
      providerRegistry.register("integration-test", { stream: streamFn });

      const entry = providerRegistry.get("integration-test");
      expect(entry).toBeDefined();
      expect(entry?.stream).toBe(streamFn);

      providerRegistry.unregister("integration-test");
    });

    it("multiple providers can be registered and listed", () => {
      providerRegistry.register("multi-1", { stream: () => makeStreamResult() });
      providerRegistry.register("multi-2", { stream: () => makeStreamResult() });
      providerRegistry.register("multi-3", { stream: () => makeStreamResult() });

      const names = providerRegistry.list();
      expect(names).toContain("multi-1");
      expect(names).toContain("multi-2");
      expect(names).toContain("multi-3");

      providerRegistry.unregister("multi-1");
      providerRegistry.unregister("multi-2");
      providerRegistry.unregister("multi-3");
    });

    it("unregister does not affect other providers", () => {
      providerRegistry.register("keep-1", { stream: () => makeStreamResult() });
      providerRegistry.register("keep-2", { stream: () => makeStreamResult() });
      providerRegistry.register("remove-me", { stream: () => makeStreamResult() });

      providerRegistry.unregister("remove-me");

      expect(providerRegistry.has("keep-1")).toBe(true);
      expect(providerRegistry.has("keep-2")).toBe(true);
      expect(providerRegistry.has("remove-me")).toBe(false);

      providerRegistry.unregister("keep-1");
      providerRegistry.unregister("keep-2");
    });
  });
});
