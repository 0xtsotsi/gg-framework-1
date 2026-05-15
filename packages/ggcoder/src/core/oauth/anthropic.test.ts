import { describe, it, expect, vi, beforeEach } from "vitest";
import { loginAnthropic, refreshAnthropicToken } from "./anthropic.js";

describe("loginAnthropic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls onOpenUrl with valid OAuth URL", async () => {
    let capturedState = "";
    const onOpenUrl = vi.fn((url: string) => {
      // Capture state from URL
      const stateMatch = url.match(/state=([a-f0-9]+)/);
      if (stateMatch) capturedState = stateMatch[1];
    });
    const onPromptCode = vi.fn().mockImplementation(async (_msg: string) => {
      // Return code#state format using captured state
      return `auth_code_123#${capturedState}`;
    });
    const onStatus = vi.fn();

    // Mock fetch for token exchange
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          access_token: "access_123",
          refresh_token: "refresh_456",
          expires_in: 3600,
        }),
    }) as unknown as typeof fetch;

    await loginAnthropic({ onOpenUrl, onPromptCode, onStatus });

    expect(onOpenUrl).toHaveBeenCalledTimes(1);
    const url = onOpenUrl.mock.calls[0][0];
    expect(url).toContain("https://claude.ai/oauth/authorize");
    expect(url).toContain("code_challenge");
    expect(url).toContain("code_challenge_method=S256");
  });

  it("prompts for code with correct message", async () => {
    let capturedState = "";
    const onOpenUrl = vi.fn((url: string) => {
      const stateMatch = url.match(/state=([a-f0-9]+)/);
      if (stateMatch) capturedState = stateMatch[1];
    });
    const onPromptCode = vi.fn().mockImplementation(async () => `code#${capturedState}`);
    const onStatus = vi.fn();

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          access_token: "test",
          refresh_token: "test",
          expires_in: 3600,
        }),
    }) as unknown as typeof fetch;

    await loginAnthropic({ onOpenUrl, onPromptCode, onStatus });

    expect(onPromptCode).toHaveBeenCalledWith(
      "Paste the code from the browser (format: code#state):",
    );
  });

  it("throws on invalid code format", async () => {
    const onOpenUrl = vi.fn();
    const onPromptCode = vi.fn().mockResolvedValue("invalid_code");
    const onStatus = vi.fn();

    await expect(loginAnthropic({ onOpenUrl, onPromptCode, onStatus })).rejects.toThrow(
      "Invalid code or state mismatch",
    );
  });

  it("throws on state mismatch", async () => {
    const onOpenUrl = vi.fn();
    const onPromptCode = vi.fn().mockResolvedValue("code#wrong_state");
    const onStatus = vi.fn();

    await expect(loginAnthropic({ onOpenUrl, onPromptCode, onStatus })).rejects.toThrow(
      "Invalid code or state mismatch",
    );
  });

  it("returns OAuthCredentials on success", async () => {
    let capturedState = "";
    const onOpenUrl = vi.fn((url: string) => {
      const stateMatch = url.match(/state=([a-f0-9]+)/);
      if (stateMatch) capturedState = stateMatch[1];
    });
    const onPromptCode = vi.fn().mockImplementation(async () => `code#${capturedState}`);
    const onStatus = vi.fn();

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          access_token: "access_token_value",
          refresh_token: "refresh_token_value",
          expires_in: 7200,
        }),
    }) as unknown as typeof fetch;

    const credentials = await loginAnthropic({ onOpenUrl, onPromptCode, onStatus });

    expect(credentials).toHaveProperty("accessToken");
    expect(credentials).toHaveProperty("refreshToken");
    expect(credentials).toHaveProperty("expiresAt");
    expect(credentials.accessToken).toBe("access_token_value");
    expect(credentials.refreshToken).toBe("refresh_token_value");
  });

  it("throws on failed token exchange", async () => {
    let capturedState = "";
    const onOpenUrl = vi.fn((url: string) => {
      const stateMatch = url.match(/state=([a-f0-9]+)/);
      if (stateMatch) capturedState = stateMatch[1];
    });
    const onPromptCode = vi.fn().mockImplementation(async () => `code#${capturedState}`);
    const onStatus = vi.fn();

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: () => Promise.resolve("invalid_grant"),
    }) as unknown as typeof fetch;

    await expect(loginAnthropic({ onOpenUrl, onPromptCode, onStatus })).rejects.toThrow(
      "Anthropic token exchange failed",
    );
  });
});

describe("refreshAnthropicToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns new credentials on success", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          access_token: "new_access_token",
          refresh_token: "new_refresh_token",
          expires_in: 7200,
        }),
    }) as unknown as typeof fetch;

    const credentials = await refreshAnthropicToken("old_refresh_token");

    expect(credentials.accessToken).toBe("new_access_token");
    expect(credentials.refreshToken).toBe("new_refresh_token");
    expect(credentials.expiresAt).toBeGreaterThan(Date.now());
  });

  it("throws on failed refresh", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve("invalid_grant"),
    }) as unknown as typeof fetch;

    await expect(refreshAnthropicToken("invalid_token")).rejects.toThrow(
      "Anthropic token refresh failed",
    );
  });
});
