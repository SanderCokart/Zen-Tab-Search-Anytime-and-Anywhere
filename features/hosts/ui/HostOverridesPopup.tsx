import { useCallback, useEffect, useState } from "preact/hooks";
import { debugError } from "@/shared/debug";
import { errorMessage } from "@/shared/log";
import { uiScaleStyle } from "@/features/settings/model/ui-scale";
import { useDisplaySettings } from "@/features/search/ui/hooks/useDisplaySettings";
import { sendExtensionMessage, subscribeToSnapshotChanged } from "@/shared/messaging/client";
import {
  formatTabDisplayTitle,
  isUsableTabId,
  type HostOverrideGroup,
  type HostProxyReport,
  type HostProxyStatus,
  type TabInfo,
} from "@/shared/types";
import {
  describeHostOverride,
  hostnameOf,
  setGroupEnabled,
  toHostOverrideDraft,
  type HostOverrideDraft,
  type HostOverrideScope,
} from "@/features/hosts/model/host-override";
import { HostGroupCard } from "@/features/hosts/ui/components/HostGroupCard";
import { HostGroupForm } from "@/features/hosts/ui/components/HostGroupForm";
import { primaryButtonClass } from "@/features/hosts/ui/lib/styles";

/** Which form is open: none, a new group, or the group with this ID in this list. */
type Editing =
  | { kind: "none" }
  | { kind: "new" }
  | { kind: "edit"; scope: HostOverrideScope; id: string };

const STATUS_POLL_MS = 2000;

/** "proxy :51234 · 12 routed · 4 tunnels" plus the last error, for one IP. */
function formatProxyStatus(status: HostProxyStatus | undefined): string {
  if (!status) {
    return "proxy not started yet";
  }
  const parts = [
    status.port ? `proxy :${status.port}` : "proxy not running",
    `${status.routed} routed`,
    `${status.connected} connected`,
    `${status.open} open`,
  ];
  return status.lastError
    ? `${parts.join(" · ")} · last error: ${status.lastError}`
    : parts.join(" · ");
}

export function HostOverridesPopup({ tabId, onClose }: { tabId: number; onClose: () => void }) {
  const [tab, setTab] = useState<TabInfo>();
  const [tabGroups, setTabGroups] = useState<HostOverrideGroup[]>([]);
  const [globalGroups, setGlobalGroups] = useState<HostOverrideGroup[]>([]);
  const [proxyReport, setProxyReport] = useState<HostProxyReport>({ logPath: "", proxies: [] });
  const [editing, setEditing] = useState<Editing>({ kind: "none" });
  const [error, setError] = useState<string>();
  const displaySettings = useDisplaySettings();
  const validTab = isUsableTabId(tabId);
  const routing = [...tabGroups, ...globalGroups].some((group) => group.enabled);

  useEffect(() => {
    if (!validTab) {
      setError("Open this window from a tab's context menu.");
      return;
    }

    let cancelled = false;
    const load = () =>
      Promise.all([
        sendExtensionMessage({ type: "getTab", tabId }),
        sendExtensionMessage({ type: "getHostOverrides", tabId }),
        sendExtensionMessage({ type: "getGlobalHostOverrides" }),
      ])
        .then(([nextTab, nextTabGroups, nextGlobalGroups]) => {
          if (!cancelled) {
            setTab(nextTab);
            setTabGroups(nextTabGroups);
            setGlobalGroups(nextGlobalGroups);
          }
        })
        .catch((reason) => {
          debugError("Could not load host overrides:", reason);
          if (!cancelled) {
            setError("Make sure the extension is enabled in Zen Browser.");
          }
        });

    void load();
    const unsubscribe = subscribeToSnapshotChanged(() => {
      void load();
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [tabId, validTab]);

  // The proxies' counters change with every routed request, so poll while anything routes.
  useEffect(() => {
    let cancelled = false;
    const poll = () =>
      sendExtensionMessage({ type: "getHostProxyStatus" })
        .then((report) => {
          if (!cancelled) {
            setProxyReport(report);
          }
        })
        .catch(() => undefined);
    void poll();
    const id = routing ? window.setInterval(() => void poll(), STATUS_POLL_MS) : undefined;
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [routing]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (editing.kind !== "none") {
        setEditing({ kind: "none" });
      } else {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [editing, onClose]);

  /** Saves a whole new list for one scope. Resolves to whether it was saved. */
  const save = useCallback(
    async (scope: HostOverrideScope, next: HostOverrideGroup[]): Promise<boolean> => {
      try {
        if (scope === "global") {
          setGlobalGroups(
            await sendExtensionMessage({ type: "setGlobalHostOverrides", groups: next }),
          );
        } else {
          setTabGroups(
            await sendExtensionMessage({ type: "setHostOverrides", tabId, groups: next }),
          );
        }
        setError(undefined);
        return true;
      } catch (reason) {
        debugError("Could not save host overrides:", reason);
        setError(errorMessage(reason, "Could not save the host overrides."));
        return false;
      }
    },
    [tabId],
  );

  const listFor = (scope: HostOverrideScope) => (scope === "global" ? globalGroups : tabGroups);

  /** Saves a group into `scope`, moving it out of the other list when its scope changed. */
  const saveGroup = async (
    group: HostOverrideGroup,
    scope: HostOverrideScope,
    from?: HostOverrideScope,
  ): Promise<boolean> => {
    const target = listFor(scope);
    const replaced = target.some((item) => item.id === group.id)
      ? target.map((item) => (item.id === group.id ? group : item))
      : [...target, group];
    if (!(await save(scope, replaced))) {
      return false;
    }
    if (from && from !== scope) {
      return save(
        from,
        listFor(from).filter((item) => item.id !== group.id),
      );
    }
    return true;
  };

  const tabHostname = tab ? hostnameOf(tab.url) : "";
  // A tab's own group wins over a global one for the same hostname, so list both as active.
  const active = [
    ...tabGroups
      .filter((group) => group.enabled)
      .map((group) => ({ group, scope: "tab" as const })),
    ...globalGroups
      .filter((group) => group.enabled)
      .map((group) => ({ group, scope: "global" as const })),
  ];
  const newDraft: HostOverrideDraft = {
    ip: "",
    description: "",
    hostnames: tabHostname,
    enabled: true,
    scope: "tab",
  };

  const renderList = (scope: HostOverrideScope, title: string, empty: string) => {
    const groups = listFor(scope);
    return (
      <section class="flex flex-col gap-[var(--zen-space-1)]">
        <h2 class="text-zen-subtle m-0 text-[length:var(--zen-text-sm)] font-semibold tracking-wide uppercase">
          {title}
        </h2>
        {groups.length === 0 && (
          <p class="text-zen-faint m-0 text-[length:var(--zen-text-sm)]">{empty}</p>
        )}
        <ul class="m-0 flex list-none flex-col gap-[var(--zen-space-2)] p-0">
          {groups.map((group) =>
            editing.kind === "edit" && editing.scope === scope && editing.id === group.id ? (
              <li key={group.id}>
                <HostGroupForm
                  initial={toHostOverrideDraft(group, scope)}
                  submitLabel="Save"
                  onCancel={() => setEditing({ kind: "none" })}
                  onSubmit={(updated, nextScope) => {
                    void saveGroup(updated, nextScope, scope).then(
                      (saved) => saved && setEditing({ kind: "none" }),
                    );
                  }}
                />
              </li>
            ) : (
              <HostGroupCard
                key={group.id}
                group={group}
                onToggle={() => {
                  void save(scope, setGroupEnabled(groups, !group.enabled, group.id));
                }}
                onEdit={() => {
                  setError(undefined);
                  setEditing({ kind: "edit", scope, id: group.id });
                }}
                onDelete={() => {
                  void save(
                    scope,
                    groups.filter((item) => item.id !== group.id),
                  );
                }}
              />
            ),
          )}
        </ul>
      </section>
    );
  };

  return (
    <div
      class="flex flex-col gap-[var(--zen-space-3)]"
      data-zen-ui
      style={{ ...uiScaleStyle(displaySettings, "popup"), color: displaySettings.textColor }}
    >
      <header class="flex flex-col gap-[var(--zen-space-1)]">
        <h1 class="m-0 text-[length:var(--zen-text-md)] font-semibold">Host overrides</h1>
        <p class="text-zen-subtle m-0 truncate text-[length:var(--zen-text-sm)]">
          {tab ? formatTabDisplayTitle(tab) : validTab ? "Loading tab…" : ""}
          {tabHostname && ` · ${tabHostname}`}
        </p>
      </header>

      {active.length > 0 && (
        <section
          class="flex flex-col gap-[var(--zen-space-1)] rounded-[var(--zen-radius)] border border-amber-500/60 bg-amber-900/30 p-[var(--zen-space-2)] text-[length:var(--zen-text-sm)]"
          role="status"
        >
          <strong>This tab's traffic is being rerouted</strong>
          {active.map(({ group, scope }) => (
            <div key={`${scope}:${group.id}`} class="flex flex-col">
              <span>
                {group.hostnames.join(", ")} → {group.ip} via{" "}
                <strong>{describeHostOverride(group)}</strong>
                {scope === "global" && " (all tabs)"}
              </span>
              <span class="text-zen-subtle break-all">
                {formatProxyStatus(proxyReport.proxies.find((status) => status.ip === group.ip))}
              </span>
            </div>
          ))}
        </section>
      )}

      {renderList(
        "tab",
        "This tab",
        "No overrides for this tab. They act like a hosts file for just this tab.",
      )}
      {renderList("global", "All tabs", "No overrides for every tab.")}

      {editing.kind === "new" ? (
        <HostGroupForm
          initial={newDraft}
          submitLabel="Add"
          onCancel={() => setEditing({ kind: "none" })}
          onSubmit={(group, scope) => {
            void saveGroup(group, scope).then((saved) => saved && setEditing({ kind: "none" }));
          }}
        />
      ) : (
        <button
          type="button"
          class={primaryButtonClass}
          disabled={!tab}
          onClick={() => {
            setError(undefined);
            setEditing({ kind: "new" });
          }}
        >
          Add IP group
        </button>
      )}

      {error && <p class="text-zen-danger m-0 text-[length:var(--zen-text-sm)]">{error}</p>}

      {proxyReport.logPath && (
        <p class="text-zen-muted m-0 text-[length:var(--zen-text-sm)] break-all select-all">
          Error log: {proxyReport.logPath}
        </p>
      )}
    </div>
  );
}
