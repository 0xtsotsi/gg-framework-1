/**
 * CompoS Integration Layer
 * Bridges CompoS's 250+ tool integrations with ggcoder agents.
 *
 * CompoS acts as a multi-agent orchestration layer — agents can call
 * CompoS actions (GitHub, Jira, Slack, Notion, etc.) through our agents.
 *
 * Architecture:
 *   ggcoder agent → tool_call → composio action → external service
 *
 * Setup:
 *   1. Get CompoS API key: https://composio.ai/settings/api-keys
 *   2. Connect integrations (GitHub, Jira, etc.) in CompoS dashboard
 *   3. Set COMPOSIO_API_KEY env var
 *
 * Tool naming: composio__<integration>__<action>
 * e.g. composio__github__create_issue, composio__slack__send_message
 */

import { log } from "../twenty/logger.js";
import type { AgentTool } from "@kenkaiiii/gg-agent";

// CompoS API base
const COMPOSIO_API_BASE = "https://api.composio.ai/v1";

// CompoS tool definition response
interface CompoSTool {
  name: string;
  description: string;
  category: string;
  input_schema: Record<string, unknown>;
  integration: string;
}

interface CompoSToolsResponse {
  tools: CompoSTool[];
  next_cursor?: string;
}

/**
 * Fetch available CompoS tools for a specific integration or all.
 */
export async function fetchCompoSTools(
  apiKey: string,
  integration?: string,
): Promise<CompoSTool[]> {
  const params = new URLSearchParams({ limit: "100" });
  if (integration) params.set("integration", integration);

  const res = await fetch(`${COMPOSIO_API_BASE}/tools?${params}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(`CompoS API error: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as CompoSToolsResponse;
  return data.tools;
}

/**
 * Execute a CompoS action.
 */
export async function executeCompoSAction(
  apiKey: string,
  actionName: string,
  params: Record<string, unknown>,
): Promise<unknown> {
  const res = await fetch(`${COMPOSIO_API_BASE}/actions/${actionName}/execute`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ parameters: params }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`CompoS action failed: ${res.status} ${err}`);
  }

  const data = (await res.json()) as { output?: unknown; status?: string; result?: unknown };
  return data.output ?? data.result ?? data;
}

/**
 * Wrap CompoS tools as ggcoder AgentTool[].
 * These can be added directly to the agent loop.
 */
export async function createCompoSTools(
  apiKey: string,
  options?: {
    integrations?: string[];
    limit?: number;
  },
): Promise<AgentTool[]> {
  try {
    let tools: CompoSTool[];

    if (options?.integrations?.length) {
      tools = [];
      for (const integration of options.integrations) {
        const fetched = await fetchCompoSTools(apiKey, integration);
        tools.push(...fetched);
      }
    } else {
      tools = await fetchCompoSTools(apiKey);
    }

    if (options?.limit) {
      tools = tools.slice(0, options.limit);
    }

    log("info", "composio", `Loaded ${tools.length} CompoS tools`);

    return tools.map((tool): AgentTool => {
      const toolName = `composio__${tool.integration}__${tool.name}`;
      return {
        name: toolName,
        description: `[CompoS:${tool.integration}] ${tool.description}`,
        parameters: {
          parse: (args: unknown) => args,
        } as AgentTool["parameters"],
        execute: async (args) => {
          log("debug", "composio", `Executing ${tool.name}`, args as Record<string, unknown>);
          const result = await executeCompoSAction(
            apiKey,
            tool.name,
            args as Record<string, unknown>,
          );
          return typeof result === "string" ? result : JSON.stringify(result, null, 2);
        },
      };
    });
  } catch (err) {
    log("error", "composio", `Failed to load CompoS tools: ${err}`);
    return [];
  }
}

/**
 * CompoS Tool Manager — handles discovery, caching, and refresh.
 */
export class CompoSManager {
  private apiKey: string;
  private toolCache: AgentTool[] = [];
  private lastFetched: Date | null = null;
  private cacheTtlMs: number;

  constructor(apiKey: string, cacheTtlMs = 3600_000) {
    this.apiKey = apiKey;
    this.cacheTtlMs = cacheTtlMs;
  }

  async getTools(forceRefresh = false): Promise<AgentTool[]> {
    const stale = !this.lastFetched || Date.now() - this.lastFetched.getTime() > this.cacheTtlMs;

    if (!forceRefresh && !stale && this.toolCache.length > 0) {
      return this.toolCache;
    }

    this.toolCache = await createCompoSTools(this.apiKey);
    this.lastFetched = new Date();
    return this.toolCache;
  }

  getCachedTools(): AgentTool[] {
    return this.toolCache;
  }
}
