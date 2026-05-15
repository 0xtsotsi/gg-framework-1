import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs/promises";
import { SettingsManager, DEFAULT_SETTINGS } from "./settings-manager.js";

describe("SettingsManager", () => {
  const mockFilePath = "/tmp/test-settings.json";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("load", () => {
    it("loads settings from file", async () => {
      vi.spyOn(fs, "readFile").mockResolvedValue(
        JSON.stringify({
          defaultProvider: "openai",
          thinkingEnabled: true,
        }),
      );

      const manager = new SettingsManager(mockFilePath);
      const settings = await manager.load();

      expect(settings.defaultProvider).toBe("openai");
      expect(settings.thinkingEnabled).toBe(true);
    });

    it("falls back to defaults when file not found", async () => {
      vi.spyOn(fs, "readFile").mockRejectedValue(new Error("ENOENT"));

      const manager = new SettingsManager(mockFilePath);
      const settings = await manager.load();

      expect(settings).toEqual(DEFAULT_SETTINGS);
    });

    it("falls back to defaults on invalid JSON", async () => {
      vi.spyOn(fs, "readFile").mockResolvedValue("invalid json");

      const manager = new SettingsManager(mockFilePath);
      const settings = await manager.load();

      expect(settings).toEqual(DEFAULT_SETTINGS);
    });

    it("merges partial settings with defaults", async () => {
      vi.spyOn(fs, "readFile").mockResolvedValue(
        JSON.stringify({
          theme: "dark" as const,
        }),
      );

      const manager = new SettingsManager(mockFilePath);
      const settings = await manager.load();

      expect(settings.theme).toBe("dark");
      expect(settings.autoCompact).toBe(DEFAULT_SETTINGS.autoCompact);
    });

    it("validates settings schema", async () => {
      vi.spyOn(fs, "readFile").mockResolvedValue(
        JSON.stringify({
          compactThreshold: 2.0, // invalid: > 1.0
        }),
      );

      const manager = new SettingsManager(mockFilePath);
      const settings = await manager.load();

      // Should fall back to defaults for invalid values
      expect(settings.compactThreshold).toBe(DEFAULT_SETTINGS.compactThreshold);
    });
  });

  describe("save", () => {
    it("writes settings to file", async () => {
      const writeSpy = vi.spyOn(fs, "writeFile").mockResolvedValue(undefined);
      vi.spyOn(fs, "readFile").mockResolvedValue("{}");

      const manager = new SettingsManager(mockFilePath);
      await manager.load();
      await manager.save();

      expect(writeSpy).toHaveBeenCalledWith(mockFilePath, expect.any(String), "utf-8");
      const savedContent = writeSpy.mock.calls[0][1];
      const parsed = JSON.parse(savedContent as string);
      expect(parsed).toHaveProperty("autoCompact");
    });
  });

  describe("get", () => {
    it("returns value for specific key", async () => {
      vi.spyOn(fs, "readFile").mockResolvedValue(
        JSON.stringify({
          defaultProvider: "openai" as const,
        }),
      );

      const manager = new SettingsManager(mockFilePath);
      await manager.load();

      expect(manager.get("defaultProvider")).toBe("openai");
    });

    it("returns default value if not loaded", () => {
      const manager = new SettingsManager(mockFilePath);
      // Should return default before load
      expect(manager.get("autoCompact")).toBe(DEFAULT_SETTINGS.autoCompact);
    });
  });

  describe("set", () => {
    it("updates specific setting and saves", async () => {
      const writeSpy = vi.spyOn(fs, "writeFile").mockResolvedValue(undefined);
      vi.spyOn(fs, "readFile").mockResolvedValue("{}");

      const manager = new SettingsManager(mockFilePath);
      await manager.load();
      await manager.set("theme", "dark" as const);

      expect(writeSpy).toHaveBeenCalled();
      expect(manager.get("theme")).toBe("dark");
    });
  });

  describe("getAll", () => {
    it("returns copy of all settings", async () => {
      vi.spyOn(fs, "readFile").mockResolvedValue(
        JSON.stringify({
          defaultProvider: "openai" as const,
        }),
      );

      const manager = new SettingsManager(mockFilePath);
      await manager.load();
      const all = manager.getAll();

      expect(all).toEqual(
        expect.objectContaining({
          defaultProvider: "openai",
          autoCompact: true,
        }),
      );

      // Modifying returned object doesn't affect internal state
      all.defaultProvider = "anthropic";
      expect(manager.get("defaultProvider")).toBe("openai");
    });
  });
});

describe("DEFAULT_SETTINGS", () => {
  it("has all required properties", () => {
    expect(DEFAULT_SETTINGS).toHaveProperty("autoCompact");
    expect(DEFAULT_SETTINGS).toHaveProperty("compactThreshold");
    expect(DEFAULT_SETTINGS).toHaveProperty("defaultProvider");
    expect(DEFAULT_SETTINGS).toHaveProperty("maxTokens");
    expect(DEFAULT_SETTINGS).toHaveProperty("thinkingEnabled");
    expect(DEFAULT_SETTINGS).toHaveProperty("theme");
    expect(DEFAULT_SETTINGS).toHaveProperty("showTokenUsage");
    expect(DEFAULT_SETTINGS).toHaveProperty("showThinking");
  });

  it("has correct default values", () => {
    expect(DEFAULT_SETTINGS.autoCompact).toBe(true);
    expect(DEFAULT_SETTINGS.compactThreshold).toBe(0.8);
    expect(DEFAULT_SETTINGS.defaultProvider).toBe("anthropic");
    expect(DEFAULT_SETTINGS.maxTokens).toBe(16384);
    expect(DEFAULT_SETTINGS.thinkingEnabled).toBe(false);
    expect(DEFAULT_SETTINGS.theme).toBe("auto");
    expect(DEFAULT_SETTINGS.showTokenUsage).toBe(true);
    expect(DEFAULT_SETTINGS.showThinking).toBe(true);
  });
});
