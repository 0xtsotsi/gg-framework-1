/**
 * Twenty MCP Client
 * Wraps the Twenty MCP server using @modelcontextprotocol/sdk.
 * Handles auth headers, tool discovery, and tool execution.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { FindInputSchema } from "./types.js";
import { log } from "./logger.js";

const TOOL_TIMEOUT = 60_000;

export interface DiscoveredTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export class TwentyMCPClient {
  private client: Client | null = null;
  private transport: StreamableHTTPClientTransport | SSEClientTransport | null = null;
  private authToken: string;
  private mcpUrl: string;
  private connected = false;
  private toolCache: DiscoveredTool[] = [];

  constructor(mcpUrl: string, authToken: string) {
    this.mcpUrl = mcpUrl;
    this.authToken = authToken;
  }

  async connect(): Promise<void> {
    if (this.connected) return;

    const url = new URL(this.mcpUrl);
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.authToken}`,
    };

    try {
      // Try StreamableHTTP first (Twenty's primary MCP transport)
      this.transport = new StreamableHTTPClientTransport(url, {
        requestInit: {
          headers,
        },
      });

      this.client = new Client({ name: "gg-twenty", version: "0.1.0" });
      await this.client.connect(this.transport, { timeout: TOOL_TIMEOUT });
      log("info", "Connected to Twenty MCP via StreamableHTTP");
    } catch (err) {
      log("warn", `StreamableHTTP failed, trying SSE fallback: ${err}`);
      // Fallback to SSE
      this.transport = new SSEClientTransport(url, {
        eventSourceInit: {
          fetch: (url: string | URL, init?: RequestInit) => {
            return fetch(url, {
              ...init,
              headers: { ...init?.headers, ...headers },
            } as RequestInit);
          },
        },
        requestInit: { headers },
      });

      this.client = new Client({ name: "gg-twenty", version: "0.1.0" });
      await this.client.connect(this.transport, { timeout: TOOL_TIMEOUT });
      log("info", "Connected to Twenty MCP via SSE");
    }

    this.connected = true;

    // Discover all available tools
    const { tools } = await this.client.listTools();
    this.toolCache = tools.map((t) => ({
      name: t.name,
      description: t.description ?? "",
      inputSchema: t.inputSchema as Record<string, unknown>,
    }));
    log("info", `Twenty MCP connected — ${this.toolCache.length} tools available`);
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.transport = null;
      this.connected = false;
      this.toolCache = [];
      log("info", "Twenty MCP disconnected");
    }
  }

  getTools(): DiscoveredTool[] {
    return this.toolCache;
  }

  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Execute a find query against a Twenty module.
   * Uses the find_mcp_tools tool from the Twenty MCP server.
   */
  async find(args: {
    serviceName?: string;
    objectName: string;
    filter?: Record<string, unknown>;
    orderBy?: Record<string, string>;
    limit?: number;
    cursor?: string;
  }): Promise<{ data: unknown[]; cursor?: string }> {
    const parsed = FindInputSchema.parse(args);

    // Auto-detect serviceName from objectName if not provided
    const serviceName = parsed.serviceName || "standard";
    const objectName = parsed.objectName;

    const result = await this.executeTool("find_mcp_tools", {
      serviceName,
      objectName,
      filter: parsed.filter,
      orderBy: parsed.orderBy,
      limit: parsed.limit ?? 10,
      cursor: parsed.cursor,
    });

    return result as { data: unknown[]; cursor?: string };
  }

  /**
   * Execute a Twenty MCP tool by name with typed arguments.
   */
  async executeTool(toolName: string, args: Record<string, unknown> = {}): Promise<unknown> {
    if (!this.client) throw new Error("Not connected to Twenty MCP");

    log("debug", `[MCP] → ${toolName}`, args);

    try {
      const result = await this.client.callTool({ name: toolName, arguments: args }, undefined, {
        timeout: TOOL_TIMEOUT,
      });

      if (!("content" in result) || !Array.isArray(result.content)) {
        return result;
      }

      // Extract text from content array
      const texts: string[] = [];
      for (const item of result.content) {
        if (item && typeof item === "object" && "text" in item && typeof item.text === "string") {
          texts.push(item.text);
        }
      }

      const combined = texts.join("\n");
      log("debug", `[MCP] ← ${toolName}`, combined.slice(0, 200));

      // Try to parse as JSON for structured data
      try {
        return JSON.parse(combined);
      } catch {
        return combined;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log("error", `[MCP] ✗ ${toolName}: ${msg}`);
      throw err;
    }
  }

  /**
   * Convenience: find records in a module.
   */
  async findRecords(
    module: string,
    options?: {
      filter?: Record<string, unknown>;
      orderBy?: Record<string, string>;
      limit?: number;
      cursor?: string;
    },
  ): Promise<{ data: unknown[]; cursor?: string }> {
    return this.find({
      serviceName: "standard",
      objectName: module,
      ...options,
    });
  }

  /**
   * Create a record in a module.
   */
  async createRecord(module: string, data: Record<string, unknown>): Promise<{ id: string }> {
    const result = await this.executeTool("execute_mcp_tool", {
      serviceName: "standard",
      toolName: `create_${module}`,
      args: data,
    });
    return result as { id: string };
  }

  /**
   * Update a record in a module.
   */
  async updateRecord(module: string, id: string, data: Record<string, unknown>): Promise<void> {
    await this.executeTool("execute_mcp_tool", {
      serviceName: "standard",
      toolName: `update_${module}`,
      args: { id, ...data },
    });
  }

  /**
   * Delete a record.
   */
  async deleteRecord(module: string, id: string): Promise<void> {
    await this.executeTool("execute_mcp_tool", {
      serviceName: "standard",
      toolName: `delete_${module}`,
      args: { id },
    });
  }
}
