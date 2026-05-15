import type { JSONRPCRequest } from "@modelcontextprotocol/sdk/types.js";

const TWENTY_MCP_URL = process.env.TWENTY_MCP_URL || "http://localhost:3005/mcp";
const TWENTY_API_KEY = process.env.TWENTY_API_KEY;

if (!TWENTY_API_KEY) {
  console.warn("[gg-twenty] TWENTY_API_KEY not set. Set it in .env or export TWENTY_API_KEY=...");
}

interface ToolCatalog {
  catalog: Record<string, Array<{ name: string; description: string }>>;
}

export interface TwentyClient {
  callTool(toolName: string, args?: Record<string, unknown>): Promise<unknown>;

  getNotes(filter?: Record<string, unknown>): Promise<unknown[]>;
  getTasks(filter?: Record<string, unknown>): Promise<unknown[]>;
  getCompanies(filter?: Record<string, unknown>): Promise<unknown[]>;
  getPeople(filter?: Record<string, unknown>): Promise<unknown[]>;
  getOpportunities(filter?: Record<string, unknown>): Promise<unknown[]>;
  createNote(data: Record<string, unknown>): Promise<unknown>;
  createTask(data: Record<string, unknown>): Promise<unknown>;
  updateNote(id: string, data: Record<string, unknown>): Promise<unknown>;
  updateTask(id: string, data: Record<string, unknown>): Promise<unknown>;
  createCompany(data: Record<string, unknown>): Promise<unknown>;
  createPerson(data: Record<string, unknown>): Promise<unknown>;
  createOpportunity(data: Record<string, unknown>): Promise<unknown>;
}

async function mcpRequest(method: string, params: Record<string, unknown>): Promise<unknown> {
  const body: JSONRPCRequest = {
    jsonrpc: "2.0",
    id: Date.now(),
    method,
    params,
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (TWENTY_API_KEY) {
    headers["Authorization"] = `Bearer ${TWENTY_API_KEY}`;
  }

  const res = await fetch(TWENTY_MCP_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Twenty MCP HTTP ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as {
    error?: { code: number; message: string };
    result?: unknown;
  };

  if (data.error) {
    throw new Error(`MCP error ${data.error.code}: ${data.error.message}`);
  }

  return data.result;
}

export async function createTwentyClient(): Promise<TwentyClient> {
  console.log(`[gg-twenty] Connecting to ${TWENTY_MCP_URL}`);

  // Initialize: get the full tool catalog
  const catalogResult = (await mcpRequest("tools/call", {
    name: "get_tool_catalog",
    arguments: {},
  })) as { type: string; text: string }[];

  const catalogText = catalogResult?.[0]?.text || "{}";
  const catalog: ToolCatalog = JSON.parse(catalogText);
  const allTools = Object.values(catalog.catalog).flat();

  console.log(
    `[gg-twenty] ${allTools.length} tools available across ${Object.keys(catalog.catalog).length} categories`,
  );

  async function callTool(toolName: string, args: Record<string, unknown> = {}): Promise<unknown> {
    const result = (await mcpRequest("tools/call", {
      name: "execute_tool",
      arguments: {
        toolName,
        arguments: args,
      },
    })) as { type: string; text: string }[];

    const text = result?.[0]?.text || "[]";
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  return {
    callTool,

    async getNotes(filter = {}) {
      return (await callTool("find_notes", { filter, limit: 50 })) as unknown[];
    },

    async getTasks(filter = {}) {
      return (await callTool("find_tasks", { filter, limit: 50 })) as unknown[];
    },

    async getCompanies(filter = {}) {
      return (await callTool("find_companies", {
        filter,
        limit: 50,
      })) as unknown[];
    },

    async getPeople(filter = {}) {
      return (await callTool("find_people", { filter, limit: 50 })) as unknown[];
    },

    async getOpportunities(filter = {}) {
      return (await callTool("find_opportunities", {
        filter,
        limit: 50,
      })) as unknown[];
    },

    async createNote(data) {
      return await callTool("create_note", { data });
    },

    async createTask(data) {
      return await callTool("create_task", { data });
    },

    async updateNote(id, data) {
      return await callTool("update_note", { id, data });
    },

    async updateTask(id, data) {
      return await callTool("update_task", { id, data });
    },

    async createCompany(data) {
      return await callTool("create_company", { data });
    },

    async createPerson(data) {
      return await callTool("create_person", { data });
    },

    async createOpportunity(data) {
      return await callTool("create_opportunity", { data });
    },
  };
}
