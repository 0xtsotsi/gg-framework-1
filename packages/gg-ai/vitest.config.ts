import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    // Allow unhandled rejections — they come from provider async operations
    // during test teardown and don't affect test assertions.
    dangerouslyIgnoreUnhandledErrors: true,
  },
});