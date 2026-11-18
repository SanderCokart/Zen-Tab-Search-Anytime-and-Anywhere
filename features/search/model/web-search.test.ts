import { describe, expect, it } from "vitest";
import {
  DEFAULT_SEARCH_ENGINE,
  openFromQuery,
  searchEngineById,
  webSearchUrl,
} from "@/features/search/model/web-search";

describe("webSearchUrl", () => {
  it("builds a Google URL from the typed query", () => {
    expect(webSearchUrl("google", "zen tabs")).toBe("https://www.google.com/search?q=zen%20tabs");
  });

  it("uses DuckDuckGo when that engine is selected", () => {
    expect(webSearchUrl("duckduckgo", "gitlab mr")).toBe("https://duckduckgo.com/?q=gitlab%20mr");
  });

  it("does not search an empty or blank query", () => {
    expect(webSearchUrl("google", "")).toBeUndefined();
    expect(webSearchUrl("google", "   ")).toBeUndefined();
  });

  it("falls back to Google for an unknown engine id", () => {
    expect(webSearchUrl("unknown", "tabs")).toBe("https://www.google.com/search?q=tabs");
    expect(searchEngineById("unknown").id).toBe(DEFAULT_SEARCH_ENGINE);
  });
});

describe("openFromQuery", () => {
  it("opens a host with a site TLD instead of searching it", () => {
    expect(openFromQuery("google", "youtube.com")).toBe("https://youtube.com/");
    expect(openFromQuery("google", "gitlab.com/acme/project")).toBe(
      "https://gitlab.com/acme/project",
    );
  });

  it("keeps an already-typed http(s) address", () => {
    expect(openFromQuery("google", "https://example.com/path")).toBe("https://example.com/path");
    expect(openFromQuery("google", "http://localhost:3000")).toBe("http://localhost:3000/");
  });

  it("opens localhost and loopback over http, including a port after the host", () => {
    expect(openFromQuery("google", "localhost:5173")).toBe("http://localhost:5173/");
    expect(openFromQuery("google", "127.0.0.1:8080")).toBe("http://127.0.0.1:8080/");
  });

  it("searches words, file-like names, and a leading ?", () => {
    expect(openFromQuery("google", "zen tabs")).toBe("https://www.google.com/search?q=zen%20tabs");
    expect(openFromQuery("google", "notes.md")).toBe("https://www.google.com/search?q=notes.md");
    expect(openFromQuery("google", "?youtube.com")).toBe(
      "https://www.google.com/search?q=youtube.com",
    );
  });
});
