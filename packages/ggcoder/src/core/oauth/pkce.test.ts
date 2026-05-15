import { describe, it, expect } from "vitest";
import { generatePKCE } from "./pkce.js";

describe("generatePKCE", () => {
  it("returns verifier and challenge", async () => {
    const { verifier, challenge } = await generatePKCE();
    expect(verifier).toBeTruthy();
    expect(challenge).toBeTruthy();
    expect(typeof verifier).toBe("string");
    expect(typeof challenge).toBe("string");
  });

  it("verifier is 43 characters (base64url)", async () => {
    const { verifier } = await generatePKCE();
    // 32 bytes -> base64url encoded = 43 chars (without padding)
    expect(verifier.length).toBe(43);
  });

  it("challenge is 43 characters (base64url)", async () => {
    const { challenge } = await generatePKCE();
    // SHA-256 = 32 bytes -> base64url encoded = 43 chars
    expect(challenge.length).toBe(43);
  });

  it("verifier contains only base64url chars", async () => {
    const { verifier } = await generatePKCE();
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("challenge contains only base64url chars", async () => {
    const { challenge } = await generatePKCE();
    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("generates unique values each call", async () => {
    const result1 = await generatePKCE();
    const result2 = await generatePKCE();
    expect(result1.verifier).not.toBe(result2.verifier);
    expect(result1.challenge).not.toBe(result2.challenge);
  });
});
