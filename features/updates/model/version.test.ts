import { describe, expect, it } from "vitest";
import { isNewerVersion, parseVersion, versionSegments } from "@/features/updates/model/version";

describe("parseVersion", () => {
  it("reads plain semver with or without a v", () => {
    expect(parseVersion("4.0.2")).toEqual([4, 0, 2]);
    expect(parseVersion("v10.20.30")).toEqual([10, 20, 30]);
  });

  it("rejects anything else", () => {
    expect(parseVersion("4.0")).toBeUndefined();
    expect(parseVersion("4.0.2-canary")).toBeUndefined();
    expect(parseVersion("latest")).toBeUndefined();
  });
});

describe("isNewerVersion", () => {
  it("compares each part numerically", () => {
    expect(isNewerVersion("4.0.2", "4.0.0")).toBe(true);
    expect(isNewerVersion("4.0.10", "4.0.9")).toBe(true);
    expect(isNewerVersion("5.0.0", "4.9.9")).toBe(true);
    expect(isNewerVersion("v4.1.0", "4.0.9")).toBe(true);
  });

  it("is false for the same, an older or an unreadable version", () => {
    expect(isNewerVersion("4.0.2", "4.0.2")).toBe(false);
    expect(isNewerVersion("4.0.1", "4.0.2")).toBe(false);
    expect(isNewerVersion("nightly", "4.0.2")).toBe(false);
  });
});

describe("versionSegments", () => {
  it("marks only the parts that differ from the installed version", () => {
    expect(versionSegments("4.0.2", "4.0.0")).toEqual([
      { text: "4", changed: false },
      { text: "0", changed: false },
      { text: "2", changed: true },
    ]);
    expect(versionSegments("v5.0.0", "4.0.0").map((segment) => segment.changed)).toEqual([
      true,
      false,
      false,
    ]);
  });
});
