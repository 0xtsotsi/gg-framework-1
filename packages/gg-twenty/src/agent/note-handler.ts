/**
 * Note Handler Agent
 * Processes new/updated notes from Twenty:
 * - Summarizes content
 * - Extracts action items / todos
 * - Tags with topic classification
 * - Updates the note in Twenty with AI-generated metadata
 */

import { agentLoop, type AgentTool, type AgentEvent } from "@kenkaiiii/gg-agent";
import { streamOpenAI, providerRegistry, type Message } from "@kenkaiiii/gg-ai";
import type { TwentyMCPClient } from "../twenty/client.js";
import type { TwentyEvent, GGTwentyConfig, AgentResponse } from "../twenty/types.js";
import { log } from "../twenty/logger.js";

const SYSTEM_PROMPT = `You are NoteMind — an intelligent note processing agent.

Your job is to enhance notes that come in from Twenty CRM:
1. Summarize the note in 1-2 sentences
2. Extract action items (tasks that should be created)
3. Classify the topic (sales, engineering, ops, research, personal)
4. Rate urgency (low / medium / high)

Return a JSON response:
{
  "summary": "...",
  "actionItems": ["..."],
  "topic": "...",
  "urgency": "..."
}

Keep it brief and actionable.`;

/**
 * Create the note handler tools — Twenty CRUD operations.
 */
function createNoteTools(twenty: TwentyMCPClient): AgentTool[] {
  return [
    {
      name: "update_twenty_note",
      description: "Update a note in Twenty CRM with new data",
      parameters: {
        parse: (args: unknown) => args as { id: string; title?: string; body?: string },
      } as AgentTool["parameters"],
      execute: async (args) => {
        const { id, ...data } = args as { id: string; title?: string; body?: string };
        await twenty.updateRecord("note", id, data);
        return `Note ${id} updated successfully`;
      },
    },
    {
      name: "create_twenty_task",
      description: "Create a task in Twenty CRM",
      parameters: {
        parse: (args: unknown) =>
          args as { title: string; body?: string; status?: string; assigneeId?: string },
      } as AgentTool["parameters"],
      execute: async (args) => {
        const result = await twenty.createRecord("task", args as Record<string, unknown>);
        return `Task created with ID: ${result.id}`;
      },
    },
    {
      name: "create_twenty_activity",
      description: "Log an activity on a Twenty record",
      parameters: {
        parse: (args: unknown) => args as { targetId: string; content: string },
      } as AgentTool["parameters"],
      execute: async (args) => {
        const { targetId, content } = args as { targetId: string; content: string };
        await twenty.executeTool("execute_mcp_tool", {
          serviceName: "standard",
          toolName: "create_activity",
          args: {
            targetId,
            content,
          },
        });
        return "Activity logged";
      },
    },
  ];
}

/**
 * Process a note event from Twenty.
 */
export async function handleNoteEvent(
  event: TwentyEvent,
  twenty: TwentyMCPClient,
  config: Pick<GGTwentyConfig, "openRouterApiKey" | "openRouterBaseUrl" | "model" | "fastModel">,
): Promise<AgentResponse | null> {
  const record = event.record;
  const noteId = String(record.id ?? "");
  const title = String(record.title ?? "Untitled");
  const body = String(record.body ?? "");

  if (!title && !body) {
    log("debug", "agent:note", `Skipping empty note ${noteId}`);
    return null;
  }

  log("info", "agent:note", `[${event.action}] Processing note: ${title}`, { noteId });

  const startTime = Date.now();
  let tokensUsed = 0;
  const toolsUsed: string[] = [];

  const tools = createNoteTools(twenty);

  // Build messages for the agent
  const messages: Message[] = [
    {
      role: "system",
      content: SYSTEM_PROMPT,
    },
    {
      role: "user",
      content: `Process this note:\n\nTitle: ${title}\n\nBody: ${body || "(no body)"}`,
    },
  ];

  // Run the agent loop
  const model = config.fastModel ?? config.model ?? "openrouter/openai/gpt-4o-mini";
  const [providerPart, modelPart] = model.split("/");
  const provider = providerPart as Parameters<typeof providerRegistry.get>[0];
  const modelId = modelPart ?? model;

  try {
    // Register OpenRouter if not already
    if (!providerRegistry.has("openrouter")) {
      providerRegistry.register("openrouter", {
        stream: (options) => {
          return streamOpenAI({
            ...options,
            baseUrl: config.openRouterBaseUrl ?? "https://openrouter.ai/api/v1",
          });
        },
      });
    }

    const generator = agentLoop(messages, {
      provider: provider as "anthropic" | "openai" | "glm",
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

    // Extract the agent's final response
    const finalMsg = messages[messages.length - 1];
    let summary = "";
    if (finalMsg?.role === "assistant") {
      const content = finalMsg.content;
      if (typeof content === "string") {
        summary = content;
      } else if (Array.isArray(content)) {
        summary = content.map((c) => (c.type === "text" ? c.text : "")).join("");
      }
    }

    // Try to parse as JSON and update the note
    try {
      const parsed = JSON.parse(summary);
      if (parsed.summary || parsed.actionItems) {
        const updateData: Record<string, unknown> = {};
        if (parsed.summary) updateData.title = `[AI] ${parsed.summary}`;
        if (parsed.topic)
          updateData.body = `${body}\n\n---\n**Topic:** ${parsed.topic} | **Urgency:** ${parsed.urgency ?? "low"}\n**Summary:** ${parsed.summary ?? ""}`;

        await twenty.updateRecord("note", noteId, updateData);

        // Create tasks for action items
        if (Array.isArray(parsed.actionItems)) {
          for (const item of parsed.actionItems.slice(0, 3)) {
            await twenty.createRecord("task", {
              title: String(item),
              body: `Extracted from note: ${title}`,
              status: "pending",
            });
          }
        }
      }
    } catch {
      // Not JSON — post as activity comment instead
      if (summary) {
        await twenty.executeTool("execute_mcp_tool", {
          serviceName: "standard",
          toolName: "create_activity",
          args: { targetId: noteId, content: `🤖 AI Analysis:\n${summary}` },
        });
      }
    }

    log("info", "agent:note", `Done — ${tokensUsed} tokens, ${toolsUsed.length} tools`, {
      noteId,
      durationMs: Date.now() - startTime,
    });

    return {
      module: "note",
      recordId: noteId,
      action: event.action,
      summary,
      toolsUsed,
      tokensUsed,
      durationMs: Date.now() - startTime,
    };
  } catch (err) {
    log("error", "agent:note", `Failed for note ${noteId}: ${err}`);
    return null;
  }
}
