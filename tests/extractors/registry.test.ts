import { describe, expect, it } from "vitest";
import { detectSource, getExtractor } from "../../lib/extractors/registry";

describe("extractor registry", () => {
  it("detects freshdesk from hostname", () => {
    Object.defineProperty(window, "location", {
      value: new URL("https://acme.freshdesk.com/a/tickets/1"),
      writable: true,
    });

    expect(detectSource()).toBe("freshdesk");
    expect(getExtractor("freshdesk")?.id).toBe("freshdesk");
  });

  it("detects gitlab from hostname", () => {
    Object.defineProperty(window, "location", {
      value: new URL("https://gitlab.com/group/project/-/issues/5"),
      writable: true,
    });

    expect(detectSource()).toBe("gitlab");
    expect(getExtractor()?.id).toBe("gitlab");
  });

  it("returns null for unsupported pages", () => {
    Object.defineProperty(window, "location", {
      value: new URL("https://example.com/"),
      writable: true,
    });

    expect(detectSource()).toBeNull();
    expect(getExtractor()).toBeNull();
  });
});
