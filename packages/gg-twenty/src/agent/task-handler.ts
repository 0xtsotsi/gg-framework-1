/**
 * Task Handler Agent
 * Processes new/updated tasks from Twenty:
 * - Auto-assigns tasks based on content analysis
 * - Suggests due dates based on urgency
 * - Links related tasks / companies
 * - Posts AI suggestions as comments
 */

import { agentLoop, type AgentTool, type AgentEvent } from "@kenkaiiii/gg-agent";
import type { Message, Provider } from "@kenkaiiii/gg-ai";
import type { TwentyMCPClient } from "../twenty/client.js";
import type { TwentyEvent, GGTwentyConfig, AgentResponse } from "../twenty/types.js";
import { log } from "../twenty/logger.js";

const SYSTEM_PROMPT = `You are TaskBot — an intelligent task management agent.

When you receive a task from Twenty CRM:
1. Analyze the task title and body
2. Suggest an appropriate status (backlog / todo / in_progress / done)
3. Suggest a priority (low / medium / high)
4. Suggest a rough due date (today / this week / next week / no rush)
5. Note any missing information the task owner should add

Return a JSON response:
{
  "status": "backlog|todo|in_progress|done",
  "priority": "low|medium|high",
  "dueDate": "today|this_week|next_week|no_rush",
  "notes": "..."
}`;

function createTaskTools(twenty: TwentyMCPClient): AgentTool[] {
  return [
    {
      name: "update_twenty_task",
      description: "Update a task's fields in Twenty CRM",
      parameters: { parse: (a: unknown) => a } as AgentTool["parameters"],
      execute: async (args) => {
        const a = args as { id: string; [key: string]: unknown };
        const { id, ...data } = a;
        await twenty.updateRecord("task", id, data);
        return `Task ${id} updated`;
      },
    },
    {
      name: "create_twenty_activity",
      description: "Post a comment/activity on a task",
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
      name: "find_twenty_people",
      description: "Search for people in Twenty to assign tasks",
      parameters: { parse: (a: unknown) => a } as AgentTool["parameters"],
      execute: async (args) => {
        const a = args as { name?: string; jobTitle?: string; limit?: number };
        const result = await twenty.findRecords("person", {
          filter: a.name ? { name: { contains: a.name } } : undefined,
          limit: a.limit ?? 5,
        });
        return JSON.stringify(result.data);
      },
    },
  ];
}

export async function handleTaskEvent(
  event: TwentyEvent,
  twenty: TwentyMCPClient,
  config: Pick<GGTwentyConfig, "openRouterApiKey" | "openRouterBaseUrl" | "model" | "fastModel">,
): Promise<AgentResponse | null> {
  const record = event.record;
  const taskId = String(record.id ?? "");
  const title = String(record.title ?? "Untitled");
  const body = String(record.body ?? "");
  const status = String(record.status ?? "backlog");

  log("info", "agent:task", `[${event.action}] Processing task: ${title}`, { taskId, status });

  const startTime = Date.now();
  let tokensUsed = 0;
  const toolsUsed: string[] = [];

  // Skip completed tasks
  if (status === "done" || status === "completed") {
    log("debug", "agent:task", `Skipping completed task ${taskId}`);
    return null;
  }

  const tools = createTaskTools(twenty);
  const messages: Message[] = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `Analyze this task:\n\nTitle: ${title}\n\nBody: ${body || "(no body)"}\n\nCurrent status: ${status}`,
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

    for await (const evt of generator as AsyncIterable<AgentEvent>) {
      if (evt.type === "tool_call_end") {
        const endEvt = evt as { type: string; name?: string };
        if (endEvt.name) toolsUsed.push(endEvt.name);
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

    // Try to update task with AI suggestions
    try {
      const parsed = JSON.parse(summary);
      const updateData: Record<string, unknown> = {};

      if (parsed.status) updateData.status = parsed.status;
      if (parsed.priority)
        updateData.status = `${updateData.status ?? status} | priority:${parsed.priority}`;

      if (Object.keys(updateData).length > 0) {
        await twenty.updateRecord("task", taskId, updateData);
      }

      // Post AI analysis as comment
      const comment = [
        `🤖 **TaskBot Analysis**`,
        parsed.status ? `→ Suggested status: \`${parsed.status}\`` : "",
        parsed.priority ? `→ Priority: \`${parsed.priority}\`` : "",
        parsed.dueDate ? `→ Suggested timeline: ${parsed.dueDate}` : "",
        parsed.notes ? `\n_${parsed.notes}_` : "",
      ]
        .filter(Boolean)
        .join("\n");

      await twenty.executeTool("execute_mcp_tool", {
        serviceName: "standard",
        toolName: "create_activity",
        args: { targetId: taskId, content: comment },
      });
    } catch {
      // Not JSON — post raw analysis
      if (summary) {
        await twenty.executeTool("execute_mcp_tool", {
          serviceName: "standard",
          toolName: "create_activity",
          args: { targetId: taskId, content: `🤖 TaskBot Analysis:\n${summary}` },
        });
      }
    }

    log("info", "agent:task", `Done — ${tokensUsed} tokens, ${Date.now() - startTime}ms`, {
      taskId,
    });

    return {
      module: "task",
      recordId: taskId,
      action: event.action,
      summary,
      toolsUsed,
      tokensUsed,
      durationMs: Date.now() - startTime,
    };
  } catch (err) {
    log("error", "agent:task", `Failed for task ${taskId}: ${err}`);
    return null;
  }
}
