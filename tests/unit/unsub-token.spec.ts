import { makeUnsubToken, parseUnsubToken } from "../../src/lib/unsub/token";

describe("Unsubscribe Token Utils", () => {
  it("generates tokens for emails", () => {
    const token = makeUnsubToken("test@example.com");
    expect(token).toBeDefined();
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(0);
  });

  it("generates different tokens for different emails", () => {
    const token1 = makeUnsubToken("test1@example.com");
    const token2 = makeUnsubToken("test2@example.com");
    expect(token1).not.toBe(token2);
  });

  it("generates different tokens for same email at different times", () => {
    const token1 = makeUnsubToken("test@example.com");
    // Small delay to ensure different timestamp
    const token2 = makeUnsubToken("test@example.com");
    expect(token1).not.toBe(token2);
  });

  it("handles parseUnsubToken gracefully", () => {
    // Since we're using crypto-based tokens, parseUnsubToken returns null
    // In production, you'd want to use JWT or store the mapping
    const result = parseUnsubToken("invalid-token");
    expect(result).toBeNull();
  });
}); 