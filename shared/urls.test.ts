import { describe, expect, it } from "vitest";
import { isContentScriptInjectableUrl, isExtensionPageUrl } from "@/shared/urls";

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
