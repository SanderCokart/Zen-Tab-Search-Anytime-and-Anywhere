import { useEffect, useState } from "preact/hooks";
import { debugError } from "@/shared/debug";
import { sendExtensionMessage, subscribeToBridgeStatusChanged } from "@/shared/messaging/client";
import { cn } from "@/shared/ui/cn";
import { TooltipFor, tooltipTriggerProps, useTooltip } from "@/shared/ui/primitives/Tooltip";
import { UpdateNotice } from "@/features/updates/ui/UpdateNotice";
import { useUpdateStatus } from "@/features/updates/ui/hooks/useUpdateStatus";

export interface StatusBarProps {
  /** Persistent bar: MCP link and idle version. Off, it appears only for an update. */
  always: boolean;
}

/**
 * The line along the bottom of the search. With the Status bar setting it
 * shows the MCP link on the left and the version on the right. Without it,
 * only an available update occupies the row.
 */
export function StatusBar({ always }: StatusBarProps) {
  const { status } = useUpdateStatus();
  const updateAvailable = status?.updateAvailable === true;
  if (!always && !updateAvailable) {
    return null;
  }

  return (
    <footer
      class={cn(
        "text-zen-muted mt-[var(--zen-space-5)] flex min-w-0 shrink-0 items-center justify-between px-[var(--zen-space-1)]",
        "gap-[var(--zen-status-gap)] font-mono text-[length:var(--zen-text-xs)] tracking-[0.12em] uppercase",
      )}
      data-testid="zen-status-bar"
    >
      {always ? <McpStatusIcon /> : <span />}
      <UpdateNotice showIdle={always} />
    </footer>
  );
}

function McpStatusIcon() {
  const connected = useBridgeConnected();
  const tooltip = useTooltip();
  const label = connected ? "MCP connected" : "MCP connection not established";

  return (
    <>
      <span
        data-testid="zen-mcp-status"
        data-connected={connected || undefined}
        tabIndex={0}
        aria-label={label}
        class={cn(
          "inline-flex shrink-0 items-center",
          connected ? "text-zen-muted" : "text-zen-subtle",
        )}
        {...tooltipTriggerProps(tooltip)}
      >
        <svg class="zen-icon size-[var(--zen-icon-sm)]" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M10 13a5 5 0 0 0 7.54.54l2-2a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-2 2a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          {!connected && <path d="M4 4l16 16" />}
        </svg>
      </span>
      <TooltipFor tooltip={tooltip} content={label} />
    </>
  );
}

function useBridgeConnected(): boolean {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void sendExtensionMessage({ type: "getBridgeStatus" })
      .then((status) => {
        if (!cancelled) setConnected(status.connected);
      })
      .catch((error) => debugError("Could not read MCP bridge status:", error));
    const unsubscribe = subscribeToBridgeStatusChanged(setConnected);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return connected;
}
