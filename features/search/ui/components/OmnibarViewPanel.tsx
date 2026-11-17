import { HostOverridesPopup } from "@/features/hosts/ui/HostOverridesPopup";
import { ActiveTimersPanel } from "@/features/search/ui/components/ActiveTimersPanel";
import { TimerPopup } from "@/features/timers/ui/TimerPopup";
import type { OmnibarView } from "@/shared/messaging/protocol";
import type { TabTimer } from "@/shared/types";

export interface OmnibarViewPanelProps {
  view: OmnibarView;
  timers: Map<number, TabTimer>;
  /** Closes the view; the timer form and host overrides call it when they are done. */
  onBack: () => void;
  onClearAll: () => void;
  onClearTimer: (tabId: number) => void;
  onOpenTimer: (tabId: number) => void;
  onActivateTimer: (tabId: number) => void;
}

/**
 * What the overlay shows in place of its tab, issue and todo columns: the
 * active timers, one tab's timer, or one tab's host overrides. These used to
 * open in their own popup windows.
 */
export function OmnibarViewPanel({
  view,
  timers,
  onBack,
  onClearAll,
  onClearTimer,
  onOpenTimer,
  onActivateTimer,
}: OmnibarViewPanelProps) {
  return (
    <div class="flex min-h-0 flex-1 flex-col gap-[var(--zen-space-2)]">
      {view.kind === "timers" && (
        <span class="zs-label text-zen-muted">Click a timer to go to its tab</span>
      )}
      {/* Padded so focus outlines, drawn outside their field, are not clipped by the scroll box. */}
      <div class="zen-scroll zs-card flex min-h-0 flex-1 flex-col overflow-y-auto p-[var(--zen-space-5)]">
        {view.kind === "timers" && (
          <ActiveTimersPanel
            bare
            timers={timers}
            onClearAll={onClearAll}
            onClearTimer={onClearTimer}
            onActivateTimer={onActivateTimer}
            onEditTimer={onOpenTimer}
          />
        )}
        {view.kind === "timer" && <TimerPopup tabId={view.tabId} onClose={onBack} embedded />}
        {view.kind === "hosts" && (
          <HostOverridesPopup tabId={view.tabId} onClose={onBack} embedded />
        )}
      </div>
    </div>
  );
}
