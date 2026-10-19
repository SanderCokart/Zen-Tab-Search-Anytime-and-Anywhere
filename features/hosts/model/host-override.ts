import * as v from "valibot";
import { hostOverrideGroupSchema, hostOverrideListSchema } from "@/shared/messaging/protocol";
import type { HostOverrideGroup } from "@/shared/types";

/** Whether a group routes one tab or every tab. */
export type HostOverrideScope = "tab" | "global";

/** What the editor form holds before it becomes a group. */
export interface HostOverrideDraft {
  id?: string;
  ip: string;
  description: string;
  /** Hostnames separated by commas, spaces or new lines. */
  hostnames: string;
  enabled: boolean;
  /** The list the group is saved in. Not part of the group itself. */
  scope: HostOverrideScope;
}

export function createHostOverrideId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Splits free text into hostnames, dropping blanks and repeats. */
export function splitHostnames(text: string): string[] {
  const seen = new Set<string>();
  for (const part of text.split(/[\s,;]+/)) {
    const hostname = part.trim().toLowerCase().replace(/\.$/, "");
    if (hostname) {
      seen.add(hostname);
    }
  }
  return [...seen];
}

/** The hostname of a URL, lowercased and without a trailing dot, or "" when it has none. */
export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return "";
  }
}

/** `*.example.com` matches every subdomain of example.com, but not example.com itself. */
export function matchesHostPattern(pattern: string, hostname: string): boolean {
  if (pattern.startsWith("*.")) {
    return hostname.endsWith(pattern.slice(1));
  }
  return pattern === hostname;
}

/** The enabled group that routes `hostname`. Exact names win over wildcards. */
export function findHostOverride(
  groups: readonly HostOverrideGroup[],
  hostname: string,
): HostOverrideGroup | undefined {
  if (!hostname) {
    return undefined;
  }
  const enabled = groups.filter((group) => group.enabled);
  return (
    enabled.find((group) => group.hostnames.includes(hostname)) ??
    enabled.find((group) =>
      group.hostnames.some((pattern) => matchesHostPattern(pattern, hostname)),
    )
  );
}

/** How a group is named to the user: its description, or its IP when it has none. */
export function describeHostOverride(group: HostOverrideGroup): string {
  return group.description || group.ip;
}

/** One line per enabled group, for the toolbar tooltip. */
export function formatHostOverrideSummary(groups: readonly HostOverrideGroup[]): string {
  return groups
    .filter((group) => group.enabled)
    .map((group) => `${describeHostOverride(group)} (${group.ip}): ${group.hostnames.join(", ")}`)
    .join("\n");
}

/** The message shown when a tab first sends traffic through a group. */
export function formatHostOverrideNotice(
  group: HostOverrideGroup,
  scope: HostOverrideScope = "tab",
): {
  title: string;
  message: string;
} {
  return {
    title: `Routing via ${describeHostOverride(group)}`,
    message: `${group.hostnames.join(", ")} → ${group.ip} ${scope === "global" ? "in all tabs" : "in this tab"}.`,
  };
}

/**
 * Problems a list of groups has as a whole: an IP may appear only once (it is
 * the group), and a hostname may be routed by only one enabled group.
 */
export function findHostOverrideConflict(groups: readonly HostOverrideGroup[]): string | undefined {
  const ips = new Set<string>();
  const routed = new Map<string, HostOverrideGroup>();
  for (const group of groups) {
    const ip = group.ip.toLowerCase();
    if (ips.has(ip)) {
      return `${group.ip} is already a group. Add the hostnames to that one instead.`;
    }
    ips.add(ip);

    if (!group.enabled) {
      continue;
    }
    for (const hostname of group.hostnames) {
      const other = routed.get(hostname);
      if (other) {
        return `${hostname} is already routed to ${other.ip}. Turn one of them off first.`;
      }
      routed.set(hostname, group);
    }
  }
  return undefined;
}

/** Checks a whole list the way the background will before saving it. */
export function validateHostOverrides(
  groups: unknown,
): { groups: HostOverrideGroup[] } | { error: string } {
  const parsed = v.safeParse(hostOverrideListSchema, groups);
  if (!parsed.success) {
    return { error: parsed.issues[0]?.message ?? "Invalid host override." };
  }
  const conflict = findHostOverrideConflict(parsed.output);
  return conflict ? { error: conflict } : { groups: parsed.output };
}

/** Turns the editor form into a group, or the first thing wrong with it. */
export function parseHostOverrideDraft(
  draft: HostOverrideDraft,
): { group: HostOverrideGroup } | { error: string } {
  const parsed = v.safeParse(hostOverrideGroupSchema, {
    id: draft.id || createHostOverrideId(),
    ip: draft.ip,
    description: draft.description,
    hostnames: splitHostnames(draft.hostnames),
    enabled: draft.enabled,
  });
  if (!parsed.success) {
    return { error: parsed.issues[0]?.message ?? "Invalid host override." };
  }
  return { group: parsed.output };
}

/** The list with one group switched on or off, or every group when `groupId` is omitted. */
export function setGroupEnabled(
  groups: readonly HostOverrideGroup[],
  enabled: boolean,
  groupId?: string,
): HostOverrideGroup[] {
  return groups.map((group) =>
    groupId === undefined || group.id === groupId ? { ...group, enabled } : group,
  );
}

/** The draft that edits an existing group. */
export function toHostOverrideDraft(
  group: HostOverrideGroup,
  scope: HostOverrideScope,
): HostOverrideDraft {
  return {
    scope,
    id: group.id,
    ip: group.ip,
    description: group.description,
    hostnames: group.hostnames.join("\n"),
    enabled: group.enabled,
  };
}
