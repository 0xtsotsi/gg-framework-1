/**
 * Company Handler Agent
 * Processes new/updated companies from Twenty:
 * - Enriches company data with domain research
 * - Suggests industry/category tags
 * - Identifies potential decision makers from linked people
 * - Links related opportunities
 */

import { agentLoop, type AgentTool, type AgentEvent } from "@kenkaiiii/gg-agent";
import type { Message, Provider } from "@kenkaiiii/gg-ai";
import type { TwentyMCPClient } from "../twenty/client.js";
import type { TwentyEvent, GGTwentyConfig, AgentResponse } from "../twenty/types.js";
import { log } from "../twenty/logger.js";

const SYSTEM_PROMPT = `You are CompanyLens — a company intelligence agent.

When you receive a company from Twenty CRM:
1. Analyze the company name and domain
2. Research what this company does (use your web knowledge)
3. Suggest industry tags
4. Identify the typical decision-maker role for this type of company
5. Flag if it looks like a hot lead, warm lead, or cold lead

Return a JSON response:
{
  "industry": "...",
  "tags": ["...", "..."],
  "leadScore": "hot|warm|cold",
  "decisionMaker": "...",
  "notes": "..."
}`;

function createCompanyTools(twenty: TwentyMCPClient): AgentTool[] {
  return [
    {
      name: "update_twenty_company",
      description: "Update company fields in Twenty CRM",
      parameters: { parse: (a: unknown) => a } as AgentTool["parameters"],
      execute: async (args) => {
        const a = args as { id: string; [key: string]: unknown };
        const { id, ...data } = a;
        await twenty.updateRecord("company", id, data);
        return `Company ${id} updated`;
      },
    },
    {
      name: "create_twenty_activity",
      description: "Post an activity/comment on a company",
      parameters: { parse: (a: unknown) => a } as AgentTool["parameters"],
      execute: async (args) => {
        const a = args as { targetId: string; content: string };
        await twenty.executeTool("execute_mcp_tool", {
          serviceName: "standard",
          toolName: "create_activity",
          args: { targetId: a.targetId, content: a.content },
        });
        return "Activity posted";
      },
    },
    {
      name: "search_twenty_people",
      description: "Search for people linked to a company",
      parameters: { parse: (a: unknown) => a } as AgentTool["parameters"],
      execute: async (args) => {
        const a = args as { companyId: string; limit?: number };
        const result = await twenty.findRecords("person", {
          filter: { _companyId: { eq: a.companyId } },
          limit: a.limit ?? 10,
        });
        return JSON.stringify(result.data);
      },
    },
  ];
}

export async function handleCompanyEvent(
  event: TwentyEvent,
  twenty: TwentyMCPClient,
  config: Pick<GGTwentyConfig, "openRouterApiKey" | "openRouterBaseUrl" | "model" | "fastModel">,
): Promise<AgentResponse | null> {
  const record = event.record;
  const companyId = String(record.id ?? "");
  const name = String(record.name ?? "Unknown");
  const domain = String(record.domainName ?? "");

  log("info", "agent:company", `[${event.action}] Processing company: ${name}`, {
    companyId,
    domain,
  });

  const startTime = Date.now();
  let tokensUsed = 0;
  const toolsUsed: string[] = [];

  const tools = createCompanyTools(twenty);
  const messages: Message[] = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `Analyze this company:\n\nName: ${name}\nDomain: ${domain || "unknown"}\nIndustry: ${record.industry ?? "unknown"}\nCountry: ${record.country ?? "unknown"}`,
    },
  ];

  const model = config.fastModel ?? config.model ?? "openrouter/openai/gpt-4o-mini";
  const slashIdx = model.indexOf("/");
  const provider = (slashIdx > 0 ? model.slice(0, slashIdx) : model) as Provider;
  const modelId = slashIdx > 0 ? model.slice(slashIdx + 1) : model;

  try {
    const generator = agentLoop(messages, {
      provider,
      model: modelId,
      tools,
      apiKey: config.openRouterApiKey,
      baseUrl: config.openRouterBaseUrl ?? "https://openrouter.ai/api/v1",
      maxTokens: 1024,
      temperature: 0.3,
      signal: AbortSignal.timeout(60_000),
    });

    // Track tool names from start events
    const toolNames = new Map<string, string>();
    for await (const evt of generator as AsyncIterable<AgentEvent>) {
      if (evt.type === "tool_call_start") toolNames.set(evt.toolCallId, evt.name);
      if (evt.type === "tool_call_end" && evt.isError === false) {
        const name = toolNames.get(evt.toolCallId) ?? "unknown";
        if (!toolsUsed.includes(name)) toolsUsed.push(name);
      }
      if (evt.type === "turn_end" && evt.usage) {
        tokensUsed += evt.usage.inputTokens + evt.usage.outputTokens;
      }
    }

    const finalMsg = messages[messages.length - 1];
    let summary = "";
    if (finalMsg?.role === "assistant") {
      const c = finalMsg.content;
      summary =
        typeof c === "string"
          ? c
          : Array.isArray(c)
            ? c.map((p) => (p.type === "text" ? p.text : "")).join("")
            : "";
    }

    // Try to parse and update
    try {
      const parsed = JSON.parse(summary);
      const updateData: Record<string, unknown> = {};
      if (parsed.industry) updateData.industry = parsed.industry;
      if (Object.keys(updateData).length > 0) {
        await twenty.updateRecord("company", companyId, updateData);
      }

      const comment = [
        `🏢 **CompanyLens Analysis**`,
        parsed.industry ? `→ Industry: \`${parsed.industry}\`` : "",
        parsed.leadScore ? `→ Lead score: \`${parsed.leadScore}\`` : "",
        Array.isArray(parsed.tags) && parsed.tags.length
          ? `→ Tags: ${parsed.tags.map((t: string) => `\`${t}\``).join(", ")}`
          : "",
        parsed.decisionMaker ? `→ Typical buyer: \`${parsed.decisionMaker}\`` : "",
        parsed.notes ? `\n_${parsed.notes}_` : "",
      ]
        .filter(Boolean)
        .join("\n");

      await twenty.executeTool("execute_mcp_tool", {
        serviceName: "standard",
        toolName: "create_activity",
        args: { targetId: companyId, content: comment },
      });
    } catch {
      if (summary) {
        await twenty.executeTool("execute_mcp_tool", {
          serviceName: "standard",
          toolName: "create_activity",
          args: { targetId: companyId, content: `🏢 CompanyLens Analysis:\n${summary}` },
        });
      }
    }

    log("info", "agent:company", `Done — ${tokensUsed} tokens, ${Date.now() - startTime}ms`, {
      companyId,
    });

    return {
      module: "company",
      recordId: companyId,
      action: event.action,
      summary,
      toolsUsed,
      tokensUsed,
      durationMs: Date.now() - startTime,
    };
  } catch (err) {
    log("error", "agent:company", `Failed for company ${companyId}: ${err}`);
    return null;
  }
}
