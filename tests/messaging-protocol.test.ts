import { describe, expect, it } from "vitest";
import {
  parseContentCommand,
  parseExtensionRequest,
  parseExtensionSuccess,
  parseStoredTimer,
  parseStoredTimers,
} from "@/lib/messaging/protocol";

describe("parseExtensionRequest", () => {
  it("accepts a getTabs request", () => {
    expect(parseExtensionRequest({ type: "getTabs" })).toEqual({ type: "getTabs" });
  });

  it("accepts a getSnapshot request", () => {
    expect(parseExtensionRequest({ type: "getSnapshot", anchorTabId: 3 })).toEqual({
      type: "getSnapshot",
      anchorTabId: 3,
    });
  });

  it("rejects a missing space id", () => {
    expect(() => parseExtensionRequest({ type: "switchSpace" })).toThrow();
  });
});

describe("parseExtensionSuccess", () => {
  it("parses tab lists with missing optional fields", () => {
    expect(
      parseExtensionSuccess("getTabs", [
        { id: 1, title: "Home", url: "https://example.com", windowId: 1 },
      ]),
    ).toEqual([
      {
        id: 1,
        title: "Home",
        url: "https://example.com",
        favIconUrl: "",
        windowId: 1,
      },
    ]);
  });

  it("parses a search snapshot", () => {
    expect(
      parseExtensionSuccess("getSnapshot", {
        tabs: [{ id: 1, title: "Home", url: "https://example.com", windowId: 1 }],
        spaces: [{ id: "space-a" }],
        timers: [{ tabId: 1, endAt: 1 }],
      }),
    ).toEqual({
      tabs: [
        {
          id: 1,
          title: "Home",
          url: "https://example.com",
          favIconUrl: "",
          windowId: 1,
        },
      ],
      spaces: [{ id: "space-a", name: "", isActive: false }],
      timers: [{ tabId: 1, endAt: 1, originalLabel: "", title: "" }],
    });
  });
});

describe("parseContentCommand", () => {
  it("accepts toggleOmnibar", () => {
    expect(parseContentCommand({ type: "toggleOmnibar", anchorTabId: 2 })).toEqual({
      type: "toggleOmnibar",
      anchorTabId: 2,
    });
  });

  it("ignores unknown content messages", () => {
    expect(parseContentCommand({ type: "getTabs" })).toBeUndefined();
  });
});

describe("parseStoredTimers", () => {
  it("keeps valid timers and drops malformed entries", () => {
    expect(
      parseStoredTimers({
        "1": { tabId: 1, endAt: 9, originalLabel: "A", title: "Tab" },
        bad: { tabId: "nope" },
      }),
    ).toEqual({
      "1": { tabId: 1, endAt: 9, originalLabel: "A", title: "Tab" },
    });
  });

  it("parses a single stored timer", () => {
    expect(parseStoredTimer({ tabId: 2, endAt: 11, originalLabel: "B", title: "Docs" })).toEqual({
      tabId: 2,
      endAt: 11,
      originalLabel: "B",
      title: "Docs",
    });
    expect(parseStoredTimer({ tabId: "nope" })).toBeUndefined();
  });
});
