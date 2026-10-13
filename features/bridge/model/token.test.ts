import { describe, expect, it } from "vitest";
import { generateBridgeToken, normalizeBridgeToken } from "@/features/bridge/model/token";

describe("generateBridgeToken", () => {
  it("encodes 32 random bytes as 64 hex characters", () => {
    const token = generateBridgeToken((array) => array.fill(10));
    expect(token).toBe("0a".repeat(32));
  });

  it("produces different tokens with the real random source", () => {
    expect(generateBridgeToken()).not.toBe(generateBridgeToken());
  });
});

describe("normalizeBridgeToken", () => {
  it("trims strings and treats blank or non-string values as missing", () => {
    expect(normalizeBridgeToken("  abc ")).toBe("abc");
    expect(normalizeBridgeToken("  ")).toBeUndefined();
    expect(normalizeBridgeToken(42)).toBeUndefined();
  });
});
