import { describe, expect, it } from "vitest";
import { parsePinnedUrl } from "@/features/search/model/pinned-url";

describe("parsePinnedUrl", () => {
  it("keeps an http(s) URL and adds https when the scheme is missing", () => {
    expect(parsePinnedUrl(" https://example.com/path ")).toBe("https://example.com/path");
    expect(parsePinnedUrl("example.com/inbox")).toBe("https://example.com/inbox");
  });

  it("rejects empty, non-web, and malformed values", () => {
    expect(parsePinnedUrl("")).toBeNull();
    expect(parsePinnedUrl("javascript:alert(1)")).toBeNull();
    expect(parsePinnedUrl("not a url")).toBeNull();
  });
});
