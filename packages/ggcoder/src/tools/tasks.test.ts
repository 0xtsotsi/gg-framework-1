import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createTasksTool } from "./tasks.js";

describe("createTasksTool", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "tasks-test-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe("add action", () => {
    it("adds task with title and prompt", async () => {
      const tool = createTasksTool(tmpDir);
      const result = await tool.execute(
        { action: "add", title: "Test task", prompt: "Do something" },
        { signal: new AbortController().signal, toolCallId: "test-1" },
      );

      expect(result).toContain("Test task");
      expect(result).toMatch(/id: [a-f0-9]{8}/);
    });

    it("returns error when title missing", async () => {
      const tool = createTasksTool(tmpDir);
      const result = await tool.execute(
        { action: "add", prompt: "Do something" },
        { signal: new AbortController().signal, toolCallId: "test-2" },
      );

      expect(result).toContain("Error: title is required");
    });

    it("returns error when prompt missing", async () => {
      const tool = createTasksTool(tmpDir);
      const result = await tool.execute(
        { action: "add", title: "Test task" },
        { signal: new AbortController().signal, toolCallId: "test-3" },
      );

      expect(result).toContain("Error: prompt is required");
    });
  });

  describe("list action", () => {
    it("returns 'No tasks' when empty", async () => {
      const tool = createTasksTool(tmpDir);
      const result = await tool.execute(
        { action: "list" },
        { signal: new AbortController().signal, toolCallId: "test-4" },
      );

      expect(result).toBe("No tasks.");
    });

    it("lists all tasks with status", async () => {
      const tool = createTasksTool(tmpDir);

      await tool.execute(
        { action: "add", title: "Task 1", prompt: "First task" },
        { signal: new AbortController().signal, toolCallId: "test-5" },
      );
      await tool.execute(
        { action: "add", title: "Task 2", prompt: "Second task" },
        { signal: new AbortController().signal, toolCallId: "test-6" },
      );

      const result = await tool.execute(
        { action: "list" },
        { signal: new AbortController().signal, toolCallId: "test-7" },
      );

      expect(result).toContain("Task 1");
      expect(result).toContain("Task 2");
      expect(result).toContain("pending");
    });
  });

  describe("done action", () => {
    it("marks task as done", async () => {
      const tool = createTasksTool(tmpDir);

      // Add a task
      const addResult = await tool.execute(
        { action: "add", title: "To complete", prompt: "Do it" },
        { signal: new AbortController().signal, toolCallId: "test-8" },
      );
      const taskId = (addResult as string).match(/id: ([a-f0-9-]+)/)?.[1];

      // Mark it done
      const doneResult = await tool.execute(
        { action: "done", id: taskId!.slice(0, 8) },
        { signal: new AbortController().signal, toolCallId: "test-9" },
      );

      expect(doneResult as string).toContain("Marked done");

      // List should show checkmark
      const listResult = await tool.execute(
        { action: "list" },
        { signal: new AbortController().signal, toolCallId: "test-10" },
      );
      expect(listResult as string).toContain("✓");
    });

    it("returns error when id missing", async () => {
      const tool = createTasksTool(tmpDir);
      const result = await tool.execute(
        { action: "done" },
        { signal: new AbortController().signal, toolCallId: "test-11" },
      );

      expect(result).toContain("Error: id is required");
    });

    it("returns error when task not found", async () => {
      const tool = createTasksTool(tmpDir);
      const result = await tool.execute(
        { action: "done", id: "nonexistent" },
        { signal: new AbortController().signal, toolCallId: "test-12" },
      );

      expect(result).toContain("no task found");
    });
  });

  describe("remove action", () => {
    it("removes task", async () => {
      const tool = createTasksTool(tmpDir);

      // Add a task
      const addResult = await tool.execute(
        { action: "add", title: "To remove", prompt: "Remove this" },
        { signal: new AbortController().signal, toolCallId: "test-13" },
      );
      const taskId = (addResult as string).match(/id: ([a-f0-9-]+)/)?.[1];

      // Remove it
      const removeResult = await tool.execute(
        { action: "remove", id: taskId!.slice(0, 8) },
        { signal: new AbortController().signal, toolCallId: "test-14" },
      );

      expect(removeResult as string).toContain("Removed");

      // List should be empty
      const listResult = await tool.execute(
        { action: "list" },
        { signal: new AbortController().signal, toolCallId: "test-15" },
      );
      expect(listResult as string).toBe("No tasks.");
    });

    it("returns error when id missing", async () => {
      const tool = createTasksTool(tmpDir);
      const result = await tool.execute(
        { action: "remove" },
        { signal: new AbortController().signal, toolCallId: "test-16" },
      );

      expect(result).toContain("Error: id is required");
    });

    it("returns error when task not found", async () => {
      const tool = createTasksTool(tmpDir);
      const result = await tool.execute(
        { action: "remove", id: "nonexistent" },
        { signal: new AbortController().signal, toolCallId: "test-17" },
      );

      expect(result).toContain("no task found");
    });
  });

  it("serializes concurrent calls", async () => {
    const tool = createTasksTool(tmpDir);

    // Add 3 tasks concurrently
    const results = await Promise.all([
      tool.execute(
        { action: "add", title: "Task A", prompt: "A" },
        { signal: new AbortController().signal, toolCallId: "test-a" },
      ),
      tool.execute(
        { action: "add", title: "Task B", prompt: "B" },
        { signal: new AbortController().signal, toolCallId: "test-b" },
      ),
      tool.execute(
        { action: "add", title: "Task C", prompt: "C" },
        { signal: new AbortController().signal, toolCallId: "test-c" },
      ),
    ]);

    // All should succeed (serialized, no race conditions)
    expect(results.every((r) => (r as string).includes("Task"))).toBe(true);
  });
});
