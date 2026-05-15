import { describe, it, expect } from "vitest";
import { MCPClientManager } from "./client.js";

// Test basic instantiation and empty cases
describe("MCPClientManager", () => {
  it("can be instantiated", () => {
    const manager = new MCPClientManager();
    expect(manager).toBeDefined();
  });

  it("returns empty array when no configs", async () => {
    const manager = new MCPClientManager();
    const tools = await manager.connectAll([]);
    expect(tools).toHaveLength(0);
  });

  it("returns empty array when all configs disabled", async () => {
    const manager = new MCPClientManager();
    const tools = await manager.connectAll([
      { name: "server1", url: "http://localhost:3000", enabled: false },
    ]);
    expect(tools).toHaveLength(0);
  });

  // Test dispose doesn't throw on empty manager
  it("dispose is safe on empty manager", async () => {
    const manager = new MCPClientManager();
    await expect(manager.dispose()).resolves.not.toThrow();
  });
});
