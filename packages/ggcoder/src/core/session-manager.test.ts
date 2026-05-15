import { describe, it, expect, beforeEach } from "vitest";
import { SessionManager } from "./session-manager.js";
import type { Message } from "@kenkaiiii/gg-ai";
import type { MessageEntry, SessionEntry } from "./session-manager.js";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

// ── Helpers ─────────────────────────────────────────────────

function msg(role: Message["role"], content: string): Message {
  return { role, content } as Message;
}

function msgEntry(
  id: string,
  parentId: string | null,
  message: Message,
  ts = "2024-01-01T00:00:00.000Z",
): MessageEntry {
  return { type: "message", id, parentId, timestamp: ts, message };
}

// ── dirForCwd ───────────────────────────────────────────────

describe("SessionManager dirForCwd", () => {
  const manager = new SessionManager("/tmp/sessions");

  it("encodes colons in path", () => {
    const dir = manager["dirForCwd"]("/Users/test:dude");
    expect(dir).not.toContain(":");
  });

  it("encodes backslashes", () => {
    const dir = manager["dirForCwd"]("C:\\Users\\test");
    expect(dir).not.toContain("\\");
  });
});

// ── create ─────────────────────────────────────────────────

describe("SessionManager.create", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "sm-create-"));
  });

  it("writes a v2 session header to file", async () => {
    const manager = new SessionManager(tmpDir);
    const result = await manager.create("/test-cwd", "anthropic", "claude-3-5-sonnet");

    const raw = await fs.readFile(result.path, "utf-8");
    const header = JSON.parse(raw.trim());
    expect(header.type).toBe("session");
    expect(header.version).toBe(2);
    expect(header.id).toBe(result.id);
    expect(header.cwd).toBe("/test-cwd");
    expect(header.provider).toBe("anthropic");
    expect(header.model).toBe("claude-3-5-sonnet");
    expect(header.leafId).toBeNull();
  });

  it("returns unique IDs", async () => {
    const manager = new SessionManager(tmpDir);
    const r1 = await manager.create("/cwd", "anthropic", "sonnet");
    const r2 = await manager.create("/cwd", "openai", "gpt-4");
    expect(r1.id).not.toBe(r2.id);
    expect(r1.path).not.toBe(r2.path);
  });
});

// ── load ───────────────────────────────────────────────────

describe("SessionManager.load", () => {
  let tmpDir: string;
  let manager: SessionManager;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "sm-load-"));
    manager = new SessionManager(tmpDir);
  });

  it("loads v2 header", async () => {
    const { path: sp } = await manager.create("/cwd", "openai", "gpt-4");
    const { header } = await manager.load(sp);
    expect(header.version).toBe(2);
    expect(header.cwd).toBe("/cwd");
  });

  it("loads message entries in order", async () => {
    const { path: sp } = await manager.create("/cwd", "anthropic", "sonnet");
    await fs.appendFile(sp, JSON.stringify(msgEntry("e1", null, msg("user", "hello"))) + "\n");
    await fs.appendFile(
      sp,
      JSON.stringify(msgEntry("e2", "e1", msg("assistant", "hi there"))) + "\n",
    );

    const { entries } = await manager.load(sp);
    expect(entries).toHaveLength(2);
    expect((entries[0] as MessageEntry).message.content).toBe("hello");
    expect((entries[1] as MessageEntry).message.content).toBe("hi there");
  });

  it("upgrades v1 header to v2", async () => {
    const sp = path.join(tmpDir, "v1.jsonl");
    await fs.writeFile(
      sp,
      JSON.stringify({
        type: "session",
        version: 1,
        id: "old-id",
        timestamp: "2024-01-01T00:00:00Z",
        cwd: "/v1-cwd",
        provider: "openai",
        model: "gpt-4",
      }) + "\n",
    );

    const { header } = await manager.load(sp);
    expect(header.version).toBe(2);
    expect(header.id).toBe("old-id");
    expect(header.leafId).toBeNull();
  });

  it("assigns id/parentId to v1 entries lacking them", async () => {
    const { path: sp } = await manager.create("/cwd", "anthropic", "sonnet");
    await fs.appendFile(
      sp,
      JSON.stringify({ type: "message", message: msg("user", "no ids") }) + "\n",
    );

    const { entries } = await manager.load(sp);
    expect((entries[0] as MessageEntry).id).toBeTruthy();
    expect((entries[0] as MessageEntry).parentId).toBeNull();
  });

  it("throws for file with no session header", async () => {
    const sp = path.join(tmpDir, "no-header.jsonl");
    await fs.writeFile(sp, JSON.stringify({ type: "not-session" }) + "\n");
    await expect(manager.load(sp)).rejects.toThrow("no header found");
  });

  it("skips malformed JSON lines", async () => {
    const { path: sp } = await manager.create("/cwd", "anthropic", "sonnet");
    await fs.appendFile(sp, "not json\n");
    await fs.appendFile(sp, JSON.stringify(msgEntry("e1", null, msg("user", "valid"))) + "\n");

    const { entries } = await manager.load(sp);
    expect(entries).toHaveLength(1);
    expect((entries[0] as MessageEntry).message.content).toBe("valid");
  });
});

// ── repairToolPairs ─────────────────────────────────────────

describe("SessionManager.repairToolPairs", () => {
  function tc(id: string, name: string, args: Record<string, unknown> = {}) {
    return { type: "tool_call" as const, id, name, args };
  }
  function tr(toolCallId: string, content: string, isError = false) {
    return { type: "tool_result" as const, toolCallId, content, isError };
  }

  it("leaves messages without tool calls untouched", () => {
    const msgs: Message[] = [msg("user", "hello"), msg("assistant", "hi")];
    const result = SessionManager.repairToolPairs(msgs);
    expect(result).toHaveLength(2);
  });

  it("leaves tool calls with matching results untouched", () => {
    const msgs: Message[] = [
      msg("assistant", "using tool"),
      { role: "assistant", content: [tc("tc1", "read", {})] } as unknown as Message,
      { role: "tool", content: [tr("tc1", "file contents")] },
    ];
    const result = SessionManager.repairToolPairs(msgs);
    // No injection — original message count preserved
    expect(result).toHaveLength(3);
  });

  it("injects synthetic tool result when no tool message follows", () => {
    const msgs: Message[] = [
      msg("assistant", "tool call"),
      { role: "assistant", content: [tc("tc1", "read", { path: "foo.ts" })] } as unknown as Message,
      msg("user", "next"),
    ];
    const result = SessionManager.repairToolPairs(msgs);
    const injected = result.find((m) => m.role === "tool");
    expect(injected).toBeDefined();
    const injectedContent = (
      injected as Message & { content: { toolCallId: string; content: string; isError: boolean }[] }
    ).content[0];
    expect(injectedContent.toolCallId).toBe("tc1");
    expect(injectedContent.content).toBe("Tool execution was interrupted.");
    expect(injectedContent.isError).toBe(true);
  });

  it("patches existing tool message with missing results", () => {
    const msgs: Message[] = [
      msg("assistant", "tools"),
      {
        role: "assistant",
        content: [tc("tc1", "read", {}), tc("tc2", "write", {})],
      } as unknown as Message,
      { role: "tool", content: [tr("tc1", "read result")] },
    ];
    const result = SessionManager.repairToolPairs(msgs);
    const toolMsg = result.find((m) => m.role === "tool") as Message & {
      content: { toolCallId: string }[];
    };
    expect(toolMsg.content).toHaveLength(2);
    expect(toolMsg.content[1]!.toolCallId).toBe("tc2");
    expect((toolMsg.content[1] as { isError: boolean }).isError).toBe(true);
  });
});

// ── getBranch ───────────────────────────────────────────────

describe("SessionManager.getBranch", () => {
  function entry(id: string, parentId: string | null): SessionEntry {
    return {
      type: "message",
      id,
      parentId,
      timestamp: "2024-01-01T00:00:00.000Z",
      message: msg("user", id),
    };
  }

  const manager = new SessionManager("/tmp");

  it("returns all entries when leafId is null", () => {
    const entries = [entry("a", null), entry("b", "a"), entry("c", "b")];
    const branch = manager.getBranch(entries, null);
    expect(branch.map((e) => e.id)).toEqual(["a", "b", "c"]);
  });

  it("returns root→leaf path", () => {
    const entries = [entry("root", null), entry("child", "root"), entry("leaf", "child")];
    const branch = manager.getBranch(entries, "leaf");
    expect(branch.map((e) => e.id)).toEqual(["root", "child", "leaf"]);
  });

  it("stops at orphan (missing parent)", () => {
    const entries = [entry("orphan", null)];
    const branch = manager.getBranch(entries, "orphan");
    expect(branch.map((e) => e.id)).toEqual(["orphan"]);
  });

  it("handles deep chains", () => {
    const entries = Array.from({ length: 20 }, (_, i) =>
      entry(String(i), i === 0 ? null : String(i - 1)),
    );
    const branch = manager.getBranch(entries, "19");
    expect(branch).toHaveLength(20);
    expect(branch[branch.length - 1]!.id).toBe("19");
  });
});

// ── listBranches ────────────────────────────────────────────

describe("SessionManager.listBranches", () => {
  function entry(id: string, parentId: string | null): SessionEntry {
    return {
      type: "message",
      id,
      parentId,
      timestamp: "2024-01-01T00:00:00.000Z",
      message: msg("user", id),
    };
  }

  const manager = new SessionManager("/tmp");

  it("returns empty for empty entries", () => {
    expect(manager.listBranches([])).toEqual([]);
  });

  it("returns single branch for linear history", () => {
    const entries = [entry("a", null), entry("b", "a"), entry("c", "b")];
    const branches = manager.listBranches(entries);
    expect(branches).toHaveLength(1);
    expect(branches[0]!.leafId).toBe("c");
    expect(branches[0]!.entryCount).toBe(3);
  });

  it("detects multiple leaf nodes", () => {
    const entries = [entry("root", null), entry("branch-a", "root"), entry("branch-b", "root")];
    const branches = manager.listBranches(entries);
    expect(branches).toHaveLength(2);
    const leafIds = branches.map((b) => b.leafId);
    expect(leafIds).toContain("branch-a");
    expect(leafIds).toContain("branch-b");
  });

  it("marks branch point at divergence", () => {
    const entries = [
      entry("root", null),
      entry("a1", "root"),
      entry("a2", "a1"),
      entry("b1", "root"),
    ];
    const branches = manager.listBranches(entries);
    // Both branches (to a2 and b1) diverge at root
    const branchA = branches.find((b) => b.leafId === "a2")!;
    const branchB = branches.find((b) => b.leafId === "b1")!;
    expect(branchA.branchPointId).toBe("root");
    expect(branchB.branchPointId).toBe("root");
  });

  it("marks root as branch point when two children diverge from it", () => {
    const entries = [entry("root", null), entry("left", "root"), entry("right", "root")];
    const branches = manager.listBranches(entries);
    for (const b of branches) {
      expect(b.branchPointId).toBe("root");
    }
  });
});

// ── getMessages ─────────────────────────────────────────────

describe("SessionManager.getMessages", () => {
  const manager = new SessionManager("/tmp");

  it("filters out system messages", () => {
    const entries: SessionEntry[] = [
      msgEntry("s", null, msg("system", "system prompt")),
      msgEntry("u", null, msg("user", "hello")),
    ];
    const msgs = manager.getMessages(entries);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]!.role).toBe("user");
  });

  it("walks from root to leaf when leafId is set", () => {
    const entries: SessionEntry[] = [
      msgEntry("a", null, msg("user", "msg-a")),
      msgEntry("b", "a", msg("assistant", "msg-b")),
      msgEntry("c", "b", msg("user", "msg-c")),
      // Branch diverge
      msgEntry("alt", "a", msg("user", "branch")),
    ];
    const msgs = manager.getMessages(entries, "alt");
    expect(msgs.map((m) => m.content)).toEqual(["msg-a", "branch"]);
  });

  it("applies repairToolPairs to the result", () => {
    const entries: SessionEntry[] = [
      msgEntry("a", null, msg("assistant", "tool")),
      {
        type: "message",
        id: "b",
        parentId: "a",
        timestamp: "2024-01-01T00:00:01.000Z",
        message: {
          role: "assistant",
          content: [{ type: "tool_call" as const, id: "tc1", name: "read", args: {} }],
        } as unknown as Message,
      },
      // No tool result
    ];
    const msgs = manager.getMessages(entries);
    // Repair should have injected a tool result
    const toolMsgs = msgs.filter((m) => m.role === "tool");
    expect(toolMsgs).toHaveLength(1);
  });
});

// ── updateLeaf ──────────────────────────────────────────────

describe("SessionManager.updateLeaf", () => {
  let tmpDir: string;
  let manager: SessionManager;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "sm-leaf-"));
    manager = new SessionManager(tmpDir);
  });

  it("writes leafId into the header line", async () => {
    const { path: sp } = await manager.create("/cwd", "anthropic", "sonnet");
    await manager.updateLeaf(sp, "leaf-xyz");

    const raw = await fs.readFile(sp, "utf-8");
    const header = JSON.parse(raw.split("\n")[0]!);
    expect(header.leafId).toBe("leaf-xyz");
  });

  it("overwrites existing leafId with new value", async () => {
    const { path: sp } = await manager.create("/cwd", "anthropic", "sonnet");
    await manager.updateLeaf(sp, "first");
    await manager.updateLeaf(sp, "second");

    const raw = await fs.readFile(sp, "utf-8");
    const header = JSON.parse(raw.split("\n")[0]!);
    expect(header.leafId).toBe("second");
  });
});

// ── list ────────────────────────────────────────────────────

describe("SessionManager.list", () => {
  let tmpDir: string;
  let manager: SessionManager;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "sm-list-"));
    manager = new SessionManager(tmpDir);
  });

  it("returns empty array for nonexistent cwd", async () => {
    const sessions = await manager.list("/does-not-exist");
    expect(sessions).toHaveLength(0);
  });

  it("lists sessions sorted newest-first", async () => {
    await manager.create("/cwd", "anthropic", "sonnet");
    await delay(60);
    await manager.create("/cwd", "openai", "gpt-4");

    const sessions = await manager.list("/cwd");
    expect(sessions).toHaveLength(2);
    expect(sessions[0]!.model).toBe("gpt-4");
    expect(sessions[1]!.model).toBe("sonnet");
  });

  it("counts only message entries for messageCount", async () => {
    const { path: sp } = await manager.create("/cwd", "anthropic", "sonnet");
    await fs.appendFile(sp, JSON.stringify(msgEntry("e1", null, msg("user", "hi"))) + "\n");
    await fs.appendFile(sp, JSON.stringify(msgEntry("e2", null, msg("assistant", "hi"))) + "\n");
    await fs.appendFile(
      sp,
      JSON.stringify({
        type: "model_change",
        id: "e3",
        parentId: null,
        timestamp: "2024-01-01T00:00:00.000Z",
        level: "high",
      }) + "\n",
    );

    const sessions = await manager.list("/cwd");
    expect(sessions[0]!.messageCount).toBe(2);
  });
});

// ── getMostRecent ───────────────────────────────────────────

describe("SessionManager.getMostRecent", () => {
  let tmpDir: string;
  let manager: SessionManager;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "sm-recent-"));
    manager = new SessionManager(tmpDir);
  });

  it("returns null when no sessions exist", async () => {
    const result = await manager.getMostRecent("/nonexistent");
    expect(result).toBeNull();
  });

  it("returns path to session with messages", async () => {
    const { path: sp } = await manager.create("/cwd", "anthropic", "sonnet");
    await fs.appendFile(sp, JSON.stringify(msgEntry("e1", null, msg("user", "hi"))) + "\n");

    const result = await manager.getMostRecent("/cwd");
    expect(result).toBe(sp);
  });

  it("skips empty sessions (no message entries)", async () => {
    await manager.create("/cwd", "anthropic", "sonnet");
    await delay(60);
    const { path: withMsgs } = await manager.create("/cwd", "openai", "gpt-4");
    await fs.appendFile(withMsgs, JSON.stringify(msgEntry("e1", null, msg("user", "hi"))) + "\n");

    const result = await manager.getMostRecent("/cwd");
    expect(result).toBe(withMsgs);
  });
});

// ── appendEntry ─────────────────────────────────────────────

describe("SessionManager.appendEntry", () => {
  let tmpDir: string;
  let manager: SessionManager;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "sm-append-"));
    manager = new SessionManager(tmpDir);
  });

  it("appends entry to session file", async () => {
    const { path: sp } = await manager.create("/cwd", "anthropic", "sonnet");
    await manager.appendEntry(sp, msgEntry("e1", null, msg("user", "hello")));

    const lines = (await fs.readFile(sp, "utf-8")).split("\n").filter(Boolean);
    expect(lines).toHaveLength(2); // header + 1 entry
    const entry = JSON.parse(lines[1]!);
    expect(entry.message.content).toBe("hello");
  });
});

// ── Helpers ────────────────────────────────────────────────

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
