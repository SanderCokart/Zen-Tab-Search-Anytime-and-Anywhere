import { describe, expect, it } from "vitest";
import {
  DEFAULT_SEARCH_ENGINE,
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
