import { describe, expect, it } from "vitest";
import {
  findHostOverride,
  findHostOverrideConflict,
  formatHostOverrideNotice,
  formatHostOverrideSummary,
  hostnameOf,
  matchesHostPattern,
  parseHostOverrideDraft,
  splitHostnames,
  validateHostOverrides,
} from "@/features/hosts/model/host-override";
import type { HostOverrideGroup } from "@/shared/types";

function group(overrides: Partial<HostOverrideGroup> = {}): HostOverrideGroup {
  return {
    id: "g1",
    ip: "10.0.0.1",
    description: "Staging",
    hostnames: ["example.com"],
    enabled: true,
    ...overrides,
  };
}

describe("host override model", () => {
  it("splits hostnames on commas, spaces and new lines, without repeats", () => {
    expect(splitHostnames(" Example.com,api.example.com\n\nexample.com.  *.cdn.test ")).toEqual([
      "example.com",
      "api.example.com",
      "*.cdn.test",
    ]);
  });

  it("reads a URL's hostname without a trailing dot", () => {
    expect(hostnameOf("https://API.Example.com.:8443/x")).toBe("api.example.com");
    expect(hostnameOf("not a url")).toBe("");
  });

  it("matches a wildcard against subdomains only", () => {
    expect(matchesHostPattern("*.example.com", "a.b.example.com")).toBe(true);
    expect(matchesHostPattern("*.example.com", "example.com")).toBe(false);
    expect(matchesHostPattern("*.example.com", "badexample.com")).toBe(false);
    expect(matchesHostPattern("example.com", "example.com")).toBe(true);
  });

  it("finds the enabled group for a hostname, exact names before wildcards", () => {
    const wildcard = group({ id: "w", ip: "10.0.0.2", hostnames: ["*.example.com"] });
    const exact = group({ id: "e", ip: "10.0.0.3", hostnames: ["api.example.com"] });
    const off = group({ id: "o", ip: "10.0.0.4", hostnames: ["web.example.com"], enabled: false });

    expect(findHostOverride([wildcard, exact, off], "api.example.com")?.id).toBe("e");
    expect(findHostOverride([wildcard, exact, off], "web.example.com")?.id).toBe("w");
    expect(findHostOverride([off], "web.example.com")).toBeUndefined();
    expect(findHostOverride([wildcard], "")).toBeUndefined();
  });

  it("treats an IP as one group", () => {
    expect(
      findHostOverrideConflict([group(), group({ id: "g2", hostnames: ["other.test"] })]),
    ).toMatch(/already a group/);
  });

  it("lets only one enabled group route a hostname", () => {
    const second = group({ id: "g2", ip: "10.0.0.2" });
    expect(findHostOverrideConflict([group(), second])).toMatch(/already routed to 10.0.0.1/);
    expect(findHostOverrideConflict([group(), { ...second, enabled: false }])).toBeUndefined();
  });

  it("parses a draft into a normalized group, or names the first problem", () => {
    const parsed = parseHostOverrideDraft({
      id: "x",
      ip: " 192.168.1.20 ",
      description: " Local ",
      hostnames: "Example.com\nAPI.example.com",
      enabled: true,
      scope: "tab",
    });
    expect(parsed).toEqual({
      group: {
        id: "x",
        ip: "192.168.1.20",
        description: "Local",
        hostnames: ["example.com", "api.example.com"],
        enabled: true,
      },
    });

    expect(
      parseHostOverrideDraft({
        ip: "nope",
        description: "",
        hostnames: "a.test",
        enabled: true,
        scope: "tab",
      }),
    ).toEqual({ error: "Enter a valid IPv4 or IPv6 address." });
    expect(
      parseHostOverrideDraft({
        ip: "10.0.0.1",
        description: "",
        hostnames: " ",
        enabled: true,
        scope: "tab",
      }),
    ).toEqual({ error: "Add at least one hostname." });
    expect(
      parseHostOverrideDraft({
        ip: "10.0.0.1",
        description: "",
        hostnames: "https://x.test/",
        enabled: true,
        scope: "tab",
      }),
    ).toEqual({ error: "Hostnames look like example.com or *.example.com." });
  });

  it("validates a whole list including conflicts", () => {
    expect(validateHostOverrides([group()])).toEqual({ groups: [group()] });
    expect(validateHostOverrides([group(), group({ id: "g2" })])).toHaveProperty("error");
    expect(validateHostOverrides("nope")).toHaveProperty("error");
  });

  it("describes routed traffic by its description, falling back to the IP", () => {
    expect(formatHostOverrideNotice(group({ hostnames: ["a.test", "b.test"] }))).toEqual({
      title: "Routing via Staging",
      message: "a.test, b.test → 10.0.0.1 in this tab.",
    });
    expect(formatHostOverrideNotice(group(), "global").message).toBe(
      "example.com → 10.0.0.1 in all tabs.",
    );
    expect(formatHostOverrideNotice(group({ description: "" })).title).toBe("Routing via 10.0.0.1");
    expect(
      formatHostOverrideSummary([group(), group({ id: "off", ip: "10.0.0.9", enabled: false })]),
    ).toBe("Staging (10.0.0.1): example.com");
  });
});
