import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  createSession,
  loadSession,
  listSessions,
  getMostRecentSession,
  persistMessage,
} from "./session.js";
import type { Message } from "@kenkaiiii/gg-ai";

describe("session", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "session-test-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe("createSession", () => {
    it("creates session file with header", async () => {
      const session = await createSession(tmpDir, "anthropic", "claude-3-5-sonnet");

      expect(session.id).toBeTruthy();
      expect(session.path).toMatch(/\.jsonl$/);

      const content = await fs.readFile(session.path, "utf-8");
      const header = JSON.parse(content.trim());
      expect(header.type).toBe("session");
      expect(header.version).toBe(1);
      expect(header.provider).toBe("anthropic");
      expect(header.model).toBe("claude-3-5-sonnet");
    });

    it("generates unique session IDs", async () => {
      const session1 = await createSession(tmpDir, "anthropic", "model1");
      const session2 = await createSession(tmpDir, "anthropic", "model2");

      expect(session1.id).not.toBe(session2.id);
    });

    it("session appends entries correctly", async () => {
      const session = await createSession(tmpDir, "anthropic", "model");

      const message: Message = {
        role: "user",
        content: "Hello",
      };
      await session.append({ type: "message", timestamp: new Date().toISOString(), message });

      const content = await fs.readFile(session.path, "utf-8");
      const lines = content.trim().split("\n");
      expect(lines.length).toBe(2); // header + message
    });
  });

  describe("loadSession", () => {
    it("loads header and messages from session file", async () => {
      const session = await createSession(tmpDir, "openai", "gpt-4");
      const msg: Message = { role: "user", content: "Test message" };
      await session.append({ type: "message", timestamp: new Date().toISOString(), message: msg });

      const { header, messages } = await loadSession(session.path);

      expect(header.provider).toBe("openai");
      expect(header.model).toBe("gpt-4");
      expect(messages).toHaveLength(1);
      expect(messages[0].content).toBe("Test message");
    });

    it("skips system messages during load", async () => {
      const session = await createSession(tmpDir, "anthropic", "model");
      await session.append({
        type: "message",
        timestamp: new Date().toISOString(),
        message: { role: "system", content: "System prompt" },
      });
      await session.append({
        type: "message",
        timestamp: new Date().toISOString(),
        message: { role: "user", content: "User message" },
      });

      const { messages } = await loadSession(session.path);

      // System message should be skipped
      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe("user");
    });

    it("throws when no header found", async () => {
      const badFile = path.join(tmpDir, "bad-session.jsonl");
      await fs.writeFile(
        badFile,
        '{"type":"message","timestamp":"1","message":{"role":"user","content":"x"}}\n',
      );

      await expect(loadSession(badFile)).rejects.toThrow("no header found");
    });
  });

  describe("listSessions", () => {
    it("returns empty array when no sessions", async () => {
      const sessions = await listSessions(tmpDir);
      expect(sessions).toHaveLength(0);
    });

    it("lists all session files", async () => {
      await createSession(tmpDir, "anthropic", "model1");
      await createSession(tmpDir, "anthropic", "model2");
      await createSession(tmpDir, "openai", "model3");

      const sessions = await listSessions(tmpDir);

      expect(sessions).toHaveLength(3);
    });

    it("sorts by timestamp descending", async () => {
      // Create sessions with different timestamps
      const s1 = await createSession(tmpDir, "anthropic", "model1");
      await new Promise((r) => setTimeout(r, 10));
      const s2 = await createSession(tmpDir, "anthropic", "model2");

      const sessions = await listSessions(tmpDir);

      // Most recent should be first
      expect(sessions[0].path).toBe(s2.path);
      expect(sessions[1].path).toBe(s1.path);
    });

    it("counts messages correctly", async () => {
      const session = await createSession(tmpDir, "anthropic", "model");
      for (let i = 0; i < 5; i++) {
        await session.append({
          type: "message",
          timestamp: new Date().toISOString(),
          message: { role: "user", content: `msg${i}` },
        });
      }

      const sessions = await listSessions(tmpDir);
      expect(sessions[0].messageCount).toBe(5);
    });

    it("skips corrupt files", async () => {
      await fs.writeFile(path.join(tmpDir, "corrupt.jsonl"), "not valid json\n");
      await createSession(tmpDir, "anthropic", "model");

      const sessions = await listSessions(tmpDir);
      expect(sessions).toHaveLength(1);
    });
  });

  describe("getMostRecentSession", () => {
    it("returns path of most recent session", async () => {
      const _s1 = await createSession(tmpDir, "anthropic", "model1");
      await new Promise((r) => setTimeout(r, 10));
      const s2 = await createSession(tmpDir, "anthropic", "model2");

      const recent = await getMostRecentSession(tmpDir);

      expect(recent).toBe(s2.path);
    });

    it("returns null when no sessions", async () => {
      const recent = await getMostRecentSession(tmpDir);
      expect(recent).toBeNull();
    });
  });

  describe("persistMessage", () => {
    it("persists message to session", async () => {
      const session = await createSession(tmpDir, "anthropic", "model");
      const message: Message = { role: "user", content: "Hello world" };

      await persistMessage(session, message);

      const content = await fs.readFile(session.path, "utf-8");
      const lines = content.trim().split("\n");
      expect(lines.length).toBe(2);

      const entry = JSON.parse(lines[1]);
      expect(entry.type).toBe("message");
      expect(entry.message.content).toBe("Hello world");
    });
  });
});
