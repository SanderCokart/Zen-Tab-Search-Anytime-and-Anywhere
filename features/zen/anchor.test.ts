import { describe, expect, it } from "vitest";
import { isUsableBrowserTabId, zenAnchorTabId } from "@/features/zen/anchor";

describe("zenAnchorTabId", () => {
  it("passes through a usable tab id and falls back to -1", () => {
    expect(zenAnchorTabId(12)).toBe(12);
    expect(zenAnchorTabId(-1)).toBe(-1);
    expect(zenAnchorTabId(undefined)).toBe(-1);
  });
});

describe("isUsableBrowserTabId", () => {
  it("requires a non-negative id that is not an extension page", () => {
    expect(isUsableBrowserTabId(3, "https://example.com")).toBe(true);
    expect(isUsableBrowserTabId(-1, "https://example.com")).toBe(false);
    expect(isUsableBrowserTabId(3, "moz-extension://abc/popup.html")).toBe(false);
  });
});
