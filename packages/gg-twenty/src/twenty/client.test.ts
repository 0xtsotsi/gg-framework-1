/**
 * Tests for Twenty MCP Client (client.ts)
 * Mocks @modelcontextprotocol/sdk to test CRUD operations.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

// ── Mock @modelcontextprotocol/sdk ──────────────────────────────────────────

const mockCallTool = vi.fn<() => Promise<unknown>>();
const mockListTools = vi.fn<
  () => Promise<{
    tools: Array<{ name: string; description?: string; inputSchema: Record<string, unknown> }>;
  }>
>();
const mockClose = vi.fn<() => Promise<void>>();
const mockConnect = vi.fn<() => Promise<void>>();

vi.mock("@modelcontextprotocol/sdk/client/index.js", () => ({
  Client: vi.fn().mockImplementation(() => ({
    connect: mockConnect,
    close: mockClose,
    listTools: mockListTools,
    callTool: mockCallTool,
  })),
}));

vi.mock("@modelcontextprotocol/sdk/client/streamableHttp.js", () => ({
  StreamableHTTPClientTransport: vi.fn().mockImplementation(() => ({})),
}));

vi.mock("@modelcontextprotocol/sdk/client/sse.js", () => ({
  SSEClientTransport: vi.fn().mockImplementation(() => ({})),
}));

// ── Import after mocks ──────────────────────────────────────────────────────

import { TwentyMCPClient } from "./client.js";
import type { DiscoveredTool } from "./client.js";

describe("TwentyMCPClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default tool list
    mockListTools.mockResolvedValue({
      tools: [
        { name: "find_mcp_tools", description: "Find records", inputSchema: {} },
        { name: "execute_mcp_tool", description: "Execute a tool", inputSchema: {} },
        { name: "create_activity", description: "Create activity", inputSchema: {} },
      ],
    });

    // Default tool call returns empty JSON array
    mockCallTool.mockResolvedValue({ content: [{ type: "text", text: "[]" }] });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("connect()", () => {
    it("connects successfully via StreamableHTTP", async () => {
      const client = new TwentyMCPClient("http://localhost:3005/mcp", "test-token");
      await client.connect();

      expect(mockConnect).toHaveBeenCalledTimes(1);
      expect(client.isConnected()).toBe(true);
    });

    it("fails to connect without a client instance", async () => {
      const client = new TwentyMCPClient("http://localhost:3005/mcp", "test-token");
      // Client is not connected yet
      expect(client.isConnected()).toBe(false);
    });

    it("skips reconnect if already connected", async () => {
      const client = new TwentyMCPClient("http://localhost:3005/mcp", "test-token");
      await client.connect();
      await client.connect(); // second call
      // Should only have called connect once
      expect(mockConnect).toHaveBeenCalledTimes(1);
    });
  });

  describe("disconnect()", () => {
    it("disconnects and clears tool cache", async () => {
      const client = new TwentyMCPClient("http://localhost:3005/mcp", "test-token");
      await client.connect();
      await client.disconnect();

      expect(mockClose).toHaveBeenCalledTimes(1);
      expect(client.isConnected()).toBe(false);
      expect(client.getTools()).toHaveLength(0);
    });

    it("does nothing if not connected", async () => {
      const client = new TwentyMCPClient("http://localhost:3005/mcp", "test-token");
      await client.disconnect();
      expect(mockClose).not.toHaveBeenCalled();
    });
  });

  describe("getTools()", () => {
    it("returns discovered tools after connect", async () => {
      mockListTools.mockResolvedValue({
        tools: [
          { name: "find_mcp_tools", description: "Find records", inputSchema: { type: "object" } },
          { name: "update_note", description: "Update note", inputSchema: { type: "object" } },
          { name: "create_task", description: "Create task", inputSchema: { type: "object" } },
        ],
      });

      const client = new TwentyMCPClient("http://localhost:3005/mcp", "test-token");
      await client.connect();

      const tools = client.getTools();
      expect(tools).toHaveLength(3);
      expect(tools[0].name).toBe("find_mcp_tools");
      expect(tools[0].inputSchema).toEqual({ type: "object" });
    });
  });

  describe("find()", () => {
    it("executes find_mcp_tools with correct args", async () => {
      mockCallTool.mockResolvedValue({
        content: [
          { type: "text", text: JSON.stringify({ data: [{ id: "note-1", title: "Test" }] }) },
        ],
      });

      const client = new TwentyMCPClient("http://localhost:3005/mcp", "test-token");
      await client.connect();

      const result = await client.find({
        serviceName: "standard",
        objectName: "note",
        limit: 10,
      });

      expect(mockCallTool).toHaveBeenCalledWith(
        {
          name: "find_mcp_tools",
          arguments: expect.objectContaining({ objectName: "note", limit: 10 }),
        },
        undefined,
        expect.any(Object),
      );
      expect(result.data).toHaveLength(1);
      expect((result.data[0] as { id: string }).id).toBe("note-1");
    });

    it("falls back to 'standard' service if not provided", async () => {
      mockCallTool.mockResolvedValue({
        content: [{ type: "text", text: JSON.stringify({ data: [] }) }],
      });

      const client = new TwentyMCPClient("http://localhost:3005/mcp", "test-token");
      await client.connect();

      await client.find({ objectName: "task" });

      expect(mockCallTool).toHaveBeenCalledWith(
        {
          name: "find_mcp_tools",
          arguments: expect.objectContaining({ serviceName: "standard", objectName: "task" }),
        },
        undefined,
        expect.any(Object),
      );
    });

    it("uses cursor from args", async () => {
      mockCallTool.mockResolvedValue({
        content: [{ type: "text", text: JSON.stringify({ data: [] }) }],
      });

      const client = new TwentyMCPClient("http://localhost:3005/mcp", "test-token");
      await client.connect();

      await client.find({ objectName: "note", cursor: "cursor-abc" });

      expect(mockCallTool).toHaveBeenCalledWith(
        { name: "find_mcp_tools", arguments: expect.objectContaining({ cursor: "cursor-abc" }) },
        undefined,
        expect.any(Object),
      );
    });

    it("throws if not connected", async () => {
      const client = new TwentyMCPClient("http://localhost:3005/mcp", "test-token");

      await expect(client.find({ objectName: "note" })).rejects.toThrow("Not connected");
    });
  });

  describe("executeTool()", () => {
    it("returns parsed JSON from text content", async () => {
      const toolResult = {
        content: [{ type: "text", text: '{"id":"note-123","title":"Updated"}' }],
      };
      mockCallTool.mockResolvedValue(toolResult);

      const client = new TwentyMCPClient("http://localhost:3005/mcp", "test-token");
      await client.connect();

      const result = await client.executeTool("update_note", { id: "note-123", title: "Updated" });

      expect(result).toEqual({ id: "note-123", title: "Updated" });
    });

    it("returns plain text if not JSON", async () => {
      mockCallTool.mockResolvedValue({
        content: [{ type: "text", text: "Activity created successfully" }],
      });

      const client = new TwentyMCPClient("http://localhost:3005/mcp", "test-token");
      await client.connect();

      const result = await client.executeTool("create_activity", {
        targetId: "note-1",
        content: "Hello",
      });

      expect(result).toBe("Activity created successfully");
    });

    it("returns raw result if no content array", async () => {
      const rawResult = { success: true };
      mockCallTool.mockResolvedValue(rawResult);

      const client = new TwentyMCPClient("http://localhost:3005/mcp", "test-token");
      await client.connect();

      const result = await client.executeTool("some_tool", {});

      expect(result).toEqual(rawResult);
    });

    it("throws on tool execution error", async () => {
      mockCallTool.mockRejectedValue(new Error("Tool not found"));

      const client = new TwentyMCPClient("http://localhost:3005/mcp", "test-token");
      await client.connect();

      await expect(client.executeTool("nonexistent_tool", {})).rejects.toThrow("Tool not found");
    });

    it("throws if not connected", async () => {
      const client = new TwentyMCPClient("http://localhost:3005/mcp", "test-token");

      await expect(client.executeTool("create_activity", {})).rejects.toThrow("Not connected");
    });
  });

  describe("findRecords()", () => {
    it("uses module name as objectName with standard service", async () => {
      mockCallTool.mockResolvedValue({
        content: [{ type: "text", text: JSON.stringify({ data: [{ id: "task-1" }] }) }],
      });

      const client = new TwentyMCPClient("http://localhost:3005/mcp", "test-token");
      await client.connect();

      await client.findRecords("task", { limit: 5, filter: { status: "todo" } });

      expect(mockCallTool).toHaveBeenCalledWith(
        {
          name: "find_mcp_tools",
          arguments: expect.objectContaining({ objectName: "task", serviceName: "standard" }),
        },
        undefined,
        expect.any(Object),
      );
    });
  });

  describe("createRecord()", () => {
    it("calls execute_mcp_tool with create_ prefix", async () => {
      mockCallTool.mockResolvedValue({
        content: [{ type: "text", text: '{"id":"new-note-456"}' }],
      });

      const client = new TwentyMCPClient("http://localhost:3005/mcp", "test-token");
      await client.connect();

      const result = await client.createRecord("note", { title: "New Note", body: "Content" });

      expect(mockCallTool).toHaveBeenCalledWith(
        {
          name: "execute_mcp_tool",
          arguments: expect.objectContaining({ toolName: "create_note" }),
        },
        undefined,
        expect.any(Object),
      );
      expect(result).toEqual({ id: "new-note-456" });
    });

    it("returns id from parsed result", async () => {
      mockCallTool.mockResolvedValue({
        content: [{ type: "text", text: '{"id":"task-created-789"}' }],
      });

      const client = new TwentyMCPClient("http://localhost:3005/mcp", "test-token");
      await client.connect();

      const result = await client.createRecord("task", { title: "New Task" });

      expect(result.id).toBe("task-created-789");
    });
  });

  describe("updateRecord()", () => {
    it("calls execute_mcp_tool with update_ prefix and includes id", async () => {
      mockCallTool.mockResolvedValue({ content: [{ type: "text", text: "OK" }] });

      const client = new TwentyMCPClient("http://localhost:3005/mcp", "test-token");
      await client.connect();

      await client.updateRecord("note", "note-123", { title: "Updated Title" });

      expect(mockCallTool).toHaveBeenCalledWith(
        {
          name: "execute_mcp_tool",
          arguments: expect.objectContaining({
            toolName: "update_note",
            args: { id: "note-123", title: "Updated Title" },
          }),
        },
        undefined,
        expect.any(Object),
      );
    });
  });

  describe("deleteRecord()", () => {
    it("calls execute_mcp_tool with delete_ prefix", async () => {
      mockCallTool.mockResolvedValue({ content: [{ type: "text", text: "Deleted" }] });

      const client = new TwentyMCPClient("http://localhost:3005/mcp", "test-token");
      await client.connect();

      await client.deleteRecord("company", "company-999");

      expect(mockCallTool).toHaveBeenCalledWith(
        {
          name: "execute_mcp_tool",
          arguments: expect.objectContaining({
            toolName: "delete_company",
            args: { id: "company-999" },
          }),
        },
        undefined,
        expect.any(Object),
      );
    });
  });

  describe("DiscoveredTool interface", () => {
    it("tools conform to DiscoveredTool shape", async () => {
      mockListTools.mockResolvedValue({
        tools: [{ name: "test_tool", description: "A test tool", inputSchema: { properties: {} } }],
      });

      const client = new TwentyMCPClient("http://localhost:3005/mcp", "test-token");
      await client.connect();

      const tools = client.getTools();
      const tool = tools[0] as DiscoveredTool;

      expect(typeof tool.name).toBe("string");
      expect(typeof tool.description).toBe("string");
      expect(typeof tool.inputSchema).toBe("object");
    });
  });
});
