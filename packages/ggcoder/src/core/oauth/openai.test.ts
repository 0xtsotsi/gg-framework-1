import { describe, it, expect, vi, beforeEach } from "vitest";
import { refreshOpenAIToken } from "./openai.js";

// Helper to create mock JWT
function createMockJWT(accountId: string): string {
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = btoa(
    JSON.stringify({
      "https://api.openai.com/auth": { chatgpt_account_id: accountId },
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  );
  const signature = "mock_sig";
  return `${header}.${payload}.${signature}`;
}

describe("refreshOpenAIToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns new credentials on success", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          access_token: createMockJWT("new_account"),
          refresh_token: "new_refresh",
          expires_in: 7200,
        }),
    }) as unknown as typeof fetch;

    const creds = await refreshOpenAIToken("old_refresh");

    expect(creds.accessToken).toBe(createMockJWT("new_account"));
    expect(creds.refreshToken).toBe("new_refresh");
    expect(creds.accountId).toBe("new_account");
  });

  it("throws on failed refresh", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve("invalid_grant"),
    }) as unknown as typeof fetch;

    await expect(refreshOpenAIToken("invalid_token")).rejects.toThrow(
      "OpenAI token refresh failed",
    );
  });

  it("includes accountId in returned credentials", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          access_token: createMockJWT("chatgpt_12345"),
          refresh_token: "refresh",
          expires_in: 3600,
        }),
    }) as unknown as typeof fetch;

    const creds = await refreshOpenAIToken("refresh_token");

    expect(creds.accountId).toBe("chatgpt_12345");
  });
});
