import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createGrepTool } from "./grep.js";

describe("createGrepTool", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "grep-test-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("returns no matches when pattern not found", async () => {
    const filePath = path.join(tmpDir, "sample.txt");
    await fs.writeFile(filePath, "hello world\n");

    const tool = createGrepTool(tmpDir);
    const result = await tool.execute(
      { pattern: "xyz123" },
      { signal: new AbortController().signal, toolCallId: "test" },
    );

    expect(result).toBe("No matches found.");
  });

  it("finds matches in file", async () => {
    const filePath = path.join(tmpDir, "sample.txt");
    await fs.writeFile(filePath, "hello world\nhello there\n");

    const tool = createGrepTool(tmpDir);
    const result = await tool.execute(
      { pattern: "hello" },
      { signal: new AbortController().signal, toolCallId: "test" },
    );

    expect(result).toContain("hello world");
    expect(result).toContain("hello there");
  });

  it("respects max_results limit", async () => {
    const filePath = path.join(tmpDir, "multi.txt");
    await fs.writeFile(filePath, "a\na\na\na\na\na\na\n");

    const tool = createGrepTool(tmpDir);
    const result = await tool.execute(
      { pattern: "a", max_results: 2 },
      { signal: new AbortController().signal, toolCallId: "test" },
    );

    expect(result).toContain("[Truncated at 2 matches]");
  });

  it("handles case insensitive search", async () => {
    const filePath = path.join(tmpDir, "case.txt");
    // Multiple lines to ensure the flag works properly
    await fs.writeFile(filePath, "Hello world\nHELLO again\nhello there\n");

    const tool = createGrepTool(tmpDir);
    const result = await tool.execute(
      { pattern: "hello", case_insensitive: true },
      { signal: new AbortController().signal, toolCallId: "test" },
    );

    expect(result).toContain("case.txt");
    expect(result).toContain("3 match(es) found");
  });

  it("throws on invalid regex", async () => {
    const tool = createGrepTool(tmpDir);

    await expect(
      tool.execute(
        { pattern: "[invalid" },
        { signal: new AbortController().signal, toolCallId: "test" },
      ),
    ).rejects.toThrow("Invalid regex pattern");
  });

  it("truncates very long lines", async () => {
    const filePath = path.join(tmpDir, "long.txt");
    const longLine = "a".repeat(600);
    await fs.writeFile(filePath, longLine + "\n");

    const tool = createGrepTool(tmpDir);
    const result = await tool.execute(
      { pattern: "a+" },
      { signal: new AbortController().signal, toolCallId: "test" },
    );

    // Long line should be truncated
    expect(result).toContain("…");
    expect(result).not.toContain("a".repeat(600));
  });

  it("searches directory with glob pattern", async () => {
    await fs.writeFile(path.join(tmpDir, "test.ts"), "function hello() {}\n");
    await fs.writeFile(path.join(tmpDir, "readme.txt"), "hello world\n");
    await fs.writeFile(path.join(tmpDir, "data.json"), "hello\n");

    const tool = createGrepTool(tmpDir);
    const result = await tool.execute(
      { pattern: "hello", include: "*.ts" },
      { signal: new AbortController().signal, toolCallId: "test" },
    );

    // Should find in .ts file
    expect(result).toContain("test.ts");
  });
});
