import { TooltipButton } from "@/features/search/ui/components/TooltipButton";
import { TrafficLightIcon } from "@/features/status/ui/TrafficLightIcon";
import { tabBrowserId, type TabInfo, type TrafficLight } from "@/shared/types";
import { cn } from "@/shared/ui/cn";

/**
 * The traffic-light button that opens a tab's status color menu. Used on tab
 * rows, issue entries and todo rows; the lamp of the current color is lit.
 */
export function StatusButton({
  tab,
  light,
  open,
  onOpenMenu,
  class: className,
  iconClass,
}: {
  tab: TabInfo;
  light?: TrafficLight;
  /** Whether this tab's status menu is the one open. */
  open: boolean;
  /** Opens the status menu under the button at `anchor`. */
  onOpenMenu: (tab: TabInfo, anchor: DOMRect) => void;
  class?: string;
  iconClass: string;
}) {
  if (tabBrowserId(tab) === undefined) {
    return null;
  }

  return (
    <TooltipButton
      label={light ? `Status: ${light}` : "Set status color"}
      tooltip={light ? `Status: ${light}. Change color` : "Set a status color"}
      aria-haspopup="menu"
      aria-expanded={open}
      data-testid="zen-status-button"
      data-traffic-light-trigger=""
      class={cn("inline-flex cursor-pointer items-center border-0 bg-transparent", className)}
      onClick={(event) => {
        event.stopPropagation();
        onOpenMenu(tab, event.currentTarget.getBoundingClientRect());
      }}
    >
      <TrafficLightIcon light={light} class={iconClass} />
    </TooltipButton>
  );
}
