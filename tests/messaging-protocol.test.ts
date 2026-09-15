import { describe, expect, it } from "vitest";
import {
  parseContentCommand,
  parseExtensionRequest,
  parseExtensionSuccess,
} from "../lib/messaging/protocol";

describe("parseExtensionRequest", () => {
  it("accepts a getTabs request", () => {
    expect(parseExtensionRequest({ type: "getTabs" })).toEqual({ type: "getTabs" });
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
