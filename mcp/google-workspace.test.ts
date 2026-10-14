// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { TabSummary } from "@/shared/messaging/bridge-protocol";
import { findReusableFolder } from "./folders";
import {
  findServiceTab,
  GOOGLE_SERVICE_DEFINITIONS,
  GOOGLE_SERVICES,
  isServiceHome,
} from "./google-workspace";

describe("isServiceHome", () => {
  it("matches each canonical URL to its own service only", () => {
    for (const service of GOOGLE_SERVICES) {
      const { url } = GOOGLE_SERVICE_DEFINITIONS[service];
      for (const other of GOOGLE_SERVICES) {
        expect(isServiceHome(other, url), `${other} vs ${url}`).toBe(other === service);
      }
    }
  });

  it("matches the pages Google redirects the canonical URLs to", () => {
    expect(isServiceHome("drive", "https://drive.google.com/drive/my-drive")).toBe(true);
    expect(isServiceHome("drive", "https://drive.google.com/drive/u/1/home")).toBe(true);
    expect(isServiceHome("docs", "https://docs.google.com/document/u/0/")).toBe(true);
    expect(isServiceHome("sheets", "https://docs.google.com/spreadsheets/u/0/?tgif=d")).toBe(true);
    expect(isServiceHome("calendar", "https://calendar.google.com/calendar/u/0/r/week")).toBe(true);
    expect(isServiceHome("gmail", "https://mail.google.com/mail/u/0/#inbox")).toBe(true);
  });

  it("does not treat a specific file or folder as the service home page", () => {
    expect(isServiceHome("docs", "https://docs.google.com/document/d/abc123/edit")).toBe(false);
    expect(isServiceHome("drive", "https://drive.google.com/drive/folders/xyz")).toBe(false);
    expect(isServiceHome("gmail", "http://mail.google.com/")).toBe(false);
    expect(isServiceHome("gmail", "not a url")).toBe(false);
  });
});

describe("findServiceTab", () => {
  const tab = (id: number, url: string, essential = false): TabSummary => ({
    id,
    url,
    title: "",
    windowId: 1,
    ...(essential ? { essential: true } : {}),
  });

  it("finds the home tab but ignores essential tabs", () => {
    const tabs = [
      tab(1, "https://mail.google.com/mail/u/0/#inbox", true),
      tab(2, "https://mail.google.com/"),
    ];
    expect(findServiceTab("gmail", tabs)?.id).toBe(2);
    expect(findServiceTab("drive", tabs)).toBeUndefined();
  });
});

describe("findReusableFolder", () => {
  const folders = [
    { id: "a", name: "Google", spaceId: "general", spaceName: "General", collapsed: false },
    {
      id: "b",
      name: "Google",
      spaceId: "general",
      spaceName: "General",
      parentId: "a",
      collapsed: false,
    },
    { id: "c", name: "Google", spaceId: "work", spaceName: "Work", collapsed: false },
  ];

  it("reuses a top-level folder with the same name in the same space, ignoring case", () => {
    expect(findReusableFolder(folders, " google ", "general")?.id).toBe("a");
    expect(findReusableFolder(folders, "Google", "work")?.id).toBe("c");
    expect(findReusableFolder(folders, "Google", "home")).toBeUndefined();
    expect(findReusableFolder(folders.slice(1, 2), "Google", "general")).toBeUndefined();
  });

  it("reuses a nested folder keyed by parentId, not a same-named sibling at the root", () => {
    expect(findReusableFolder(folders, "Google", "general", "a")?.id).toBe("b");
    expect(findReusableFolder(folders, "Google", "general", "missing")).toBeUndefined();
  });
});
