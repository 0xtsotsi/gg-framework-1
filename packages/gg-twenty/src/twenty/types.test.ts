/**
 * Tests for Zod schemas and type validation in types.ts
 */

import { describe, it, expect } from "vitest";
import {
  NoteSchema,
  TaskSchema,
  CompanySchema,
  PersonSchema,
  CalendarEventSchema,
  OpportunitySchema,
  WorkflowSchema,
  FindInputSchema,
  ExecuteToolInputSchema,
} from "./types.js";
import type {
  TwentyModule,
  AgentResponse,
  SyncState,
  GGTwentyConfig,
  MCPToolResult,
} from "./types.js";

describe("NoteSchema", () => {
  it("parses a valid note", () => {
    const note = {
      id: "note-123",
      title: "Meeting Notes",
      body: "Discussed the new project timeline.",
      createdAt: "2024-01-01T10:00:00Z",
      updatedAt: "2024-01-01T10:30:00Z",
    };
    const result = NoteSchema.parse(note);
    expect(result.id).toBe("note-123");
    expect(result.title).toBe("Meeting Notes");
  });

  it("parses a note with minimal fields", () => {
    const note = { id: "note-456" };
    const result = NoteSchema.parse(note);
    expect(result.id).toBe("note-456");
    expect(result.title).toBeUndefined();
    expect(result.body).toBeUndefined();
  });

  it("throws on missing id", () => {
    const note = { title: "No ID" };
    expect(() => NoteSchema.parse(note)).toThrow();
  });

  it("throws on wrong id type", () => {
    const note = { id: 123 };
    expect(() => NoteSchema.parse(note)).toThrow();
  });
});

describe("TaskSchema", () => {
  it("parses a valid task", () => {
    const task = {
      id: "task-001",
      title: "Follow up with client",
      body: "Call John about the proposal",
      status: "todo",
      dueAt: "2024-01-15T00:00:00Z",
    };
    const result = TaskSchema.parse(task);
    expect(result.id).toBe("task-001");
    expect(result.title).toBe("Follow up with client");
    expect(result.status).toBe("todo");
  });

  it("requires title", () => {
    const task = { id: "task-002" };
    expect(() => TaskSchema.parse(task)).toThrow();
  });

  it("parses optional assigneeId", () => {
    const task = {
      id: "task-003",
      title: "Review PR",
      assigneeId: "user-789",
    };
    const result = TaskSchema.parse(task);
    expect(result.assigneeId).toBe("user-789");
  });
});

describe("CompanySchema", () => {
  it("parses a valid company", () => {
    const company = {
      id: "company-001",
      name: "Acme Corp",
      domainName: "acme.com",
      industry: "Technology",
      country: "US",
    };
    const result = CompanySchema.parse(company);
    expect(result.name).toBe("Acme Corp");
    expect(result.domainName).toBe("acme.com");
    expect(result.industry).toBe("Technology");
  });

  it("requires name", () => {
    const company = { id: "company-002" };
    expect(() => CompanySchema.parse(company)).toThrow();
  });

  it("allows missing optional fields", () => {
    const company = { id: "company-003", name: "Small Biz" };
    const result = CompanySchema.parse(company);
    expect(result.name).toBe("Small Biz");
    expect(result.domainName).toBeUndefined();
    expect(result.industry).toBeUndefined();
  });
});

describe("PersonSchema", () => {
  it("parses a valid person", () => {
    const person = {
      id: "person-001",
      name: "Jane Doe",
      email: "jane@example.com",
      phone: "+1-555-0123",
      jobTitle: "CTO",
      linkedinUrl: "https://linkedin.com/in/janedoe",
      _companyId: "company-001",
    };
    const result = PersonSchema.parse(person);
    expect(result.name).toBe("Jane Doe");
    expect(result.email).toBe("jane@example.com");
    expect(result._companyId).toBe("company-001");
  });

  it("parses person with minimal fields", () => {
    const person = { id: "person-002" };
    const result = PersonSchema.parse(person);
    expect(result.id).toBe("person-002");
    expect(result.name).toBeUndefined();
    expect(result.email).toBeUndefined();
  });
});

describe("CalendarEventSchema", () => {
  it("parses a valid calendar event", () => {
    const event = {
      id: "evt-001",
      title: "Q1 Planning",
      description: "Quarterly planning session",
      startsAt: "2024-03-01T09:00:00Z",
      endsAt: "2024-03-01T17:00:00Z",
      conferenceUrl: "https://meet.example.com/q1",
    };
    const result = CalendarEventSchema.parse(event);
    expect(result.title).toBe("Q1 Planning");
    expect(result.conferenceUrl).toBe("https://meet.example.com/q1");
  });

  it("requires title", () => {
    const event = { id: "evt-002" };
    expect(() => CalendarEventSchema.parse(event)).toThrow();
  });
});

describe("OpportunitySchema", () => {
  it("parses a valid opportunity", () => {
    const opp = {
      id: "opp-001",
      name: "Enterprise Deal",
      amount: 50000,
      stage: "negotiation",
      probability: 75,
      closeDate: "2024-06-30T00:00:00Z",
    };
    const result = OpportunitySchema.parse(opp);
    expect(result.name).toBe("Enterprise Deal");
    expect(result.amount).toBe(50000);
    expect(result.probability).toBe(75);
  });

  it("allows optional numeric fields to be missing", () => {
    const opp = { id: "opp-002", name: "Small Deal" };
    const result = OpportunitySchema.parse(opp);
    expect(result.amount).toBeUndefined();
    expect(result.probability).toBeUndefined();
  });
});

describe("WorkflowSchema", () => {
  it("parses a valid workflow", () => {
    const workflow = {
      id: "wf-001",
      name: "Lead Nurturing",
      status: "active",
      trigger: "on_company_created",
    };
    const result = WorkflowSchema.parse(workflow);
    expect(result.name).toBe("Lead Nurturing");
    expect(result.status).toBe("active");
    expect(result.trigger).toBe("on_company_created");
  });

  it("requires name", () => {
    const workflow = { id: "wf-002" };
    expect(() => WorkflowSchema.parse(workflow)).toThrow();
  });
});

describe("FindInputSchema", () => {
  it("parses a minimal find query", () => {
    const query = {
      serviceName: "standard",
      objectName: "note",
    };
    const result = FindInputSchema.parse(query);
    expect(result.serviceName).toBe("standard");
    expect(result.objectName).toBe("note");
    expect(result.filter).toBeUndefined();
    expect(result.limit).toBeUndefined();
  });

  it("parses with all options", () => {
    const query = {
      serviceName: "standard",
      objectName: "task",
      filter: { status: { eq: "todo" } },
      orderBy: { createdAt: "DescNullsFirst" },
      limit: 50,
      cursor: "abc123",
    };
    const result = FindInputSchema.parse(query);
    expect(result.limit).toBe(50);
    expect(result.cursor).toBe("abc123");
    expect(result.filter).toEqual({ status: { eq: "todo" } });
  });

  it("defaults serviceName to 'standard'", () => {
    const result = FindInputSchema.parse({ objectName: "note" });
    expect(result.serviceName).toBe("standard");
  });

  it("throws on missing objectName", () => {
    expect(() => FindInputSchema.parse({ serviceName: "standard" })).toThrow();
  });
});

describe("ExecuteToolInputSchema", () => {
  it("parses a valid tool execution input", () => {
    const input = {
      serviceName: "standard",
      toolName: "create_note",
      args: { title: "Test", body: "Test body" },
    };
    const result = ExecuteToolInputSchema.parse(input);
    expect(result.toolName).toBe("create_note");
    expect(result.args).toEqual({ title: "Test", body: "Test body" });
  });

  it("allows missing args", () => {
    const input = {
      serviceName: "standard",
      toolName: "find_notes",
    };
    const result = ExecuteToolInputSchema.parse(input);
    expect(result.args).toBeUndefined();
  });

  it("throws on missing serviceName", () => {
    expect(() => ExecuteToolInputSchema.parse({ toolName: "create_note" })).toThrow();
  });
});

describe("TwentyModule union type", () => {
  it("allows valid module names", () => {
    const modules: TwentyModule[] = [
      "note",
      "task",
      "company",
      "person",
      "calendarEvent",
      "opportunity",
      "workflow",
    ];
    expect(modules).toHaveLength(7);
  });
});

describe("AgentResponse interface", () => {
  it("conforms to interface shape", () => {
    const response: AgentResponse = {
      module: "note",
      recordId: "note-001",
      action: "created",
      summary: "Summarized note content",
      toolsUsed: ["update_twenty_note"],
      tokensUsed: 500,
      durationMs: 1500,
    };
    expect(response.module).toBe("note");
    expect(response.toolsUsed).toHaveLength(1);
    expect(response.tokensUsed).toBeGreaterThan(0);
  });
});

describe("SyncState interface", () => {
  it("conforms to interface shape", () => {
    const state: SyncState = {
      cursors: {
        note: {
          module: "note",
          lastCursor: "cursor-abc",
          lastPolledAt: "2024-01-01T00:00:00Z",
          processedCount: 10,
        },
      },
      lastFullSyncAt: "2024-01-01T00:00:00Z",
      agentMemory: { note: ["note-1", "note-2"] },
    };
    expect(state.cursors.note.processedCount).toBe(10);
    expect(state.agentMemory.note).toHaveLength(2);
  });
});

describe("GGTwentyConfig interface", () => {
  it("conforms to interface shape with required fields", () => {
    const config: GGTwentyConfig = {
      twentyMcpUrl: "http://localhost:3005/mcp",
      twentyAuthToken: "token-abc",
      openRouterApiKey: "or-key-123",
    };
    expect(config.twentyMcpUrl).toBe("http://localhost:3005/mcp");
    expect(config.openRouterApiKey).toBe("or-key-123");
  });

  it("conforms with all optional fields", () => {
    const config: GGTwentyConfig = {
      twentyMcpUrl: "http://localhost:3005/mcp",
      twentyAuthToken: "token-abc",
      openRouterApiKey: "or-key-123",
      twentyWorkspaceId: "ws-123",
      openRouterBaseUrl: "https://openrouter.ai/api/v1",
      model: "anthropic/claude-3-sonnet",
      fastModel: "openrouter/openai/gpt-4o-mini",
      pollingIntervalMs: 15_000,
      enabledModules: ["note", "task", "company"],
      composioApiKey: "comp-key",
      logLevel: "debug",
    };
    expect(config.pollingIntervalMs).toBe(15_000);
    expect(config.enabledModules).toHaveLength(3);
    expect(config.logLevel).toBe("debug");
  });
});

describe("MCPToolResult interface", () => {
  it("conforms to success result shape", () => {
    const result: MCPToolResult = {
      success: true,
      data: { id: "created-123" },
    };
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ id: "created-123" });
  });

  it("conforms to error result shape", () => {
    const result: MCPToolResult = {
      success: false,
      error: "Record not found",
    };
    expect(result.success).toBe(false);
    expect(result.error).toBe("Record not found");
  });
});
