import { describe, expect, it } from "vitest";
import { findReusableSpace } from "./spaces";

describe("findReusableSpace", () => {
  const spaces = [
    { id: "general", name: "General" },
    { id: "work", name: "Work" },
  ];

  it("reuses a space with the same name, ignoring case and surrounding spaces", () => {
    expect(findReusableSpace(spaces, " work ")?.id).toBe("work");
    expect(findReusableSpace(spaces, "Home")).toBeUndefined();
  });
});
