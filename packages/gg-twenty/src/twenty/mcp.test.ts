/**
 * Tests for MCP Protocol Implementation (mcp.ts)
 * Tests the MCP request/response handling via mocked fetch.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createTwentyClient } from "./mcp.js";

// ── Mock fetch globally ─────────────────────────────────────────────────────

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("MCP Protocol (mcp.ts)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("createTwentyClient", () => {
    it("makes catalog request on init", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            result: [{ type: "text", text: JSON.stringify({ catalog: {} }) }],
          }),
      });

      await createTwentyClient();

      expect(mockFetch).toHaveBeenCalled();
      const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1] as [
        string,
        RequestInit,
      ];
      const body = JSON.parse(lastCall[1].body as string) as { method: string };
      expect(body.method).toBe("tools/call");
    });

    it("creates a client with CRUD methods", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            result: [{ type: "text", text: JSON.stringify({ catalog: { standard: [] } }) }],
          }),
      });

      const { createTwentyClient } = await import("./mcp.js");
      const client = await createTwentyClient();

      expect(typeof client.getNotes).toBe("function");
      expect(typeof client.getTasks).toBe("function");
      expect(typeof client.getCompanies).toBe("function");
      expect(typeof client.getPeople).toBe("function");
      expect(typeof client.createNote).toBe("function");
      expect(typeof client.createTask).toBe("function");
      expect(typeof client.updateNote).toBe("function");
      expect(typeof client.createCompany).toBe("function");
    });

    it("parses errors from MCP response", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            error: { code: -32602, message: "Invalid params" },
          }),
      });

      const { createTwentyClient } = await import("./mcp.js");

      await expect(createTwentyClient()).rejects.toThrow("MCP error");
    });

    it("throws on HTTP error status", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve("Internal Server Error"),
      });

      const { createTwentyClient } = await import("./mcp.js");

      await expect(createTwentyClient()).rejects.toThrow("HTTP 500");
    });

    it("includes auth header when key is present", async () => {
      // Set the env var before importing
      process.env.TWENTY_API_KEY = "test-api-key-123";

      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            result: [{ type: "text", text: JSON.stringify({ catalog: {} }) }],
          }),
      });

      const { createTwentyClient } = await import("./mcp.js");
      await createTwentyClient();

      const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1] as [
        string,
        RequestInit,
      ];
      const headers = lastCall[1].headers as Record<string, string>;
      expect(headers["Authorization"]).toBe("Bearer test-api-key-123");

      delete process.env.TWENTY_API_KEY;
    });
  });

  describe("TwentyClient CRUD operations", () => {
    let client: Awaited<ReturnType<typeof createTwentyClient>>;

    beforeEach(async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            result: [{ type: "text", text: JSON.stringify({ catalog: { standard: [] } }) }],
          }),
      });

      client = await createTwentyClient();
    });

    it("getNotes calls find_notes with filter", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({ result: [{ type: "text", text: JSON.stringify([{ id: "note-1" }]) }] }),
      });

      await client.getNotes({ title: { contains: "test" } });

      const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1] as [
        string,
        RequestInit,
      ];
      const body = JSON.parse(lastCall[1].body as string) as {
        params: { arguments: { toolName: string; arguments: Record<string, unknown> } };
      };
      expect(body.params.arguments.toolName).toBe("find_notes");
      expect(body.params.arguments.arguments.filter).toEqual({ title: { contains: "test" } });
    });

    it("getTasks returns parsed array", async () => {
      const tasks = [
        { id: "task-1", title: "Do stuff" },
        { id: "task-2", title: "Do more" },
      ];
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ result: [{ type: "text", text: JSON.stringify(tasks) }] }),
      });

      const result = await client.getTasks();

      expect(result).toHaveLength(2);
      expect((result[0] as { id: string }).id).toBe("task-1");
    });

    it("getCompanies uses limit 50 by default", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ result: [{ type: "text", text: "[]" }] }),
      });

      await client.getCompanies({});

      const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1] as [
        string,
        RequestInit,
      ];
      const body = JSON.parse(lastCall[1].body as string) as {
        params: { arguments: { arguments: { limit: number } } };
      };
      expect(body.params.arguments.arguments.limit).toBe(50);
    });

    it("createNote calls create_note tool", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({ result: [{ type: "text", text: JSON.stringify({ id: "new-note" }) }] }),
      });

      await client.createNote({ title: "My Note", body: "Note content" });

      const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1] as [
        string,
        RequestInit,
      ];
      const body = JSON.parse(lastCall[1].body as string) as {
        params: { arguments: { toolName: string; arguments: { data: Record<string, unknown> } } };
      };
      expect(body.params.arguments.toolName).toBe("create_note");
      expect(body.params.arguments.arguments.data.title).toBe("My Note");
    });

    it("updateNote calls update_note with id and data", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ result: [{ type: "text", text: "ok" }] }),
      });

      await client.updateNote("note-123", { title: "Updated Title" });

      const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1] as [
        string,
        RequestInit,
      ];
      const body = JSON.parse(lastCall[1].body as string) as {
        params: {
          arguments: { toolName: string; arguments: { id: string; data: Record<string, unknown> } };
        };
      };
      expect(body.params.arguments.toolName).toBe("update_note");
      expect(body.params.arguments.arguments.id).toBe("note-123");
      expect(body.params.arguments.arguments.data.title).toBe("Updated Title");
    });

    it("createTask calls create_task", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({ result: [{ type: "text", text: JSON.stringify({ id: "new-task" }) }] }),
      });

      await client.createTask({ title: "New task", status: "todo" });

      const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1] as [
        string,
        RequestInit,
      ];
      const body = JSON.parse(lastCall[1].body as string) as {
        params: { arguments: { toolName: string } };
      };
      expect(body.params.arguments.toolName).toBe("create_task");
    });

    it("createCompany calls create_company", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({ result: [{ type: "text", text: JSON.stringify({ id: "new-co" }) }] }),
      });

      await client.createCompany({ name: "Acme Corp", domainName: "acme.com" });

      const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1] as [
        string,
        RequestInit,
      ];
      const body = JSON.parse(lastCall[1].body as string) as {
        params: { arguments: { toolName: string } };
      };
      expect(body.params.arguments.toolName).toBe("create_company");
    });

    it("createPerson calls create_person", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            result: [{ type: "text", text: JSON.stringify({ id: "new-person" }) }],
          }),
      });

      await client.createPerson({ name: "Jane Doe", email: "jane@example.com" });

      const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1] as [
        string,
        RequestInit,
      ];
      const body = JSON.parse(lastCall[1].body as string) as {
        params: { arguments: { toolName: string } };
      };
      expect(body.params.arguments.toolName).toBe("create_person");
    });

    it("createOpportunity calls create_opportunity", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({ result: [{ type: "text", text: JSON.stringify({ id: "new-opp" }) }] }),
      });

      await client.createOpportunity({ name: "Big Deal", amount: 100000 });

      const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1] as [
        string,
        RequestInit,
      ];
      const body = JSON.parse(lastCall[1].body as string) as {
        params: { arguments: { toolName: string } };
      };
      expect(body.params.arguments.toolName).toBe("create_opportunity");
    });

    it("callTool returns parsed JSON", async () => {
      const result = { success: true, data: { id: "tool-result" } };
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ result: [{ type: "text", text: JSON.stringify(result) }] }),
      });

      const r = await client.callTool("some_tool", { arg: "value" });

      expect(r).toEqual(result);
    });

    it("callTool returns text if not JSON", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ result: [{ type: "text", text: "plain text result" }] }),
      });

      const r = await client.callTool("echo_tool", {});

      expect(r).toBe("plain text result");
    });

    it("callTool uses text from first content item", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            result: [
              { type: "text", text: "first" },
              { type: "text", text: "second" },
            ],
          }),
      });

      const r = await client.callTool("multi_tool", {});

      expect(r).toBe("first");
    });
  });
});
