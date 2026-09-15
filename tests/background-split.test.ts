import { describe, expect, it } from "vitest";
import { isContentScriptInjectableUrl, isExtensionPageUrl } from "../lib/background/urls";
import { isUsableBrowserTabId, zenAnchorTabId } from "../lib/background/zen/anchor";

describe("isContentScriptInjectableUrl", () => {
  it("allows http(s) and file URLs", () => {
    expect(isContentScriptInjectableUrl("https://example.com")).toBe(true);
    expect(isContentScriptInjectableUrl("http://localhost")).toBe(true);
    expect(isContentScriptInjectableUrl("file:///tmp/page.html")).toBe(true);
  });

  it("rejects extension and empty URLs", () => {
    expect(isContentScriptInjectableUrl("about:blank")).toBe(false);
    expect(isContentScriptInjectableUrl("moz-extension://abc/popup.html")).toBe(false);
    expect(isContentScriptInjectableUrl(undefined)).toBe(false);
  });
});

describe("isExtensionPageUrl", () => {
  it("detects extension-scheme pages", () => {
    expect(isExtensionPageUrl("moz-extension://abc/popup.html")).toBe(true);
    expect(isExtensionPageUrl("chrome-extension://abc/popup.html")).toBe(true);
    expect(isExtensionPageUrl("https://example.com")).toBe(false);
  });
});

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
