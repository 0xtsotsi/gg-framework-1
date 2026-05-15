/**
 * Shared logger for gg-twenty
 */

type LogLevel = "debug" | "info" | "warn" | "error";

let currentLevel: LogLevel = "info";

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[currentLevel];
}

export function log(
  level: LogLevel,
  tag: string,
  msg?: unknown,
  meta?: Record<string, unknown>,
): void {
  if (!shouldLog(level)) return;

  const ts = new Date().toISOString().slice(11, 23);
  const tagStr = `[${ts}][gg-twenty:${tag}]`;
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : "";

  const out = level === "error" ? console.error : console.log;
  out(`${tagStr} ${msg ?? ""}${metaStr}`);
}
