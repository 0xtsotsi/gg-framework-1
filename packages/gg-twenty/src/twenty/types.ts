import { z } from "zod";

// ── Core Record Types ───────────────────────────────────────

export const NoteSchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  body: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  _activityTargetId: z.string().optional(),
});

export const TaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string().optional(),
  status: z.string().optional(),
  assigneeId: z.string().optional(),
  dueAt: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  _activityTargetId: z.string().optional(),
});

export const CompanySchema = z.object({
  id: z.string(),
  name: z.string(),
  domainName: z.string().optional(),
  industry: z.string().optional(),
  country: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export const PersonSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  jobTitle: z.string().optional(),
  linkedinUrl: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  _companyId: z.string().optional(),
});

export const CalendarEventSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
  conferenceUrl: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export const OpportunitySchema = z.object({
  id: z.string(),
  name: z.string(),
  amount: z.number().optional(),
  stage: z.string().optional(),
  probability: z.number().optional(),
  closeDate: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export const WorkflowSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.string().optional(),
  trigger: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

// ── MCP Tool Input Schemas ───────────────────────────────────

export const FindInputSchema = z.object({
  serviceName: z.string().optional().default("standard"),
  objectName: z.string(),
  filter: z.record(z.string(), z.unknown()).optional(),
  orderBy: z.record(z.string(), z.string()).optional(),
  limit: z.number().optional(),
  cursor: z.string().optional(),
});

export const ExecuteToolInputSchema = z.object({
  serviceName: z.string(),
  toolName: z.string(),
  args: z.record(z.string(), z.unknown()).optional(),
});

// ── Sync State ──────────────────────────────────────────────

export interface ModuleCursor {
  module: string;
  lastCursor: string | null;
  lastPolledAt: string;
  processedCount: number;
  lastProcessedId?: string; // Track last processed record ID to avoid duplicates
}

export interface SyncState {
  cursors: Record<string, ModuleCursor>;
  lastFullSyncAt: string;
  agentMemory: Record<string, string[]>; // module → recent record IDs
}

// ── Event Types ─────────────────────────────────────────────

export type TwentyModule =
  | "note"
  | "task"
  | "company"
  | "person"
  | "calendarEvent"
  | "opportunity"
  | "workflow";

export interface TwentyEvent {
  module: TwentyModule;
  action: "created" | "updated" | "deleted";
  record: Record<string, unknown>;
  timestamp: string;
}

export interface AgentResponse {
  module: TwentyModule;
  recordId: string;
  action: string;
  summary: string;
  toolsUsed: string[];
  tokensUsed: number;
  durationMs: number;
}

// ── Config ──────────────────────────────────────────────────

export interface GGTwentyConfig {
  twentyMcpUrl: string;
  twentyAuthToken: string;
  twentyWorkspaceId?: string;
  openRouterApiKey: string;
  openRouterBaseUrl?: string;
  model?: string;
  fastModel?: string;
  pollingIntervalMs?: number;
  enabledModules?: TwentyModule[];
  composioApiKey?: string;
  logLevel?: "debug" | "info" | "warn";
}

// ── Tool Result Types ───────────────────────────────────────

export interface MCPToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}
