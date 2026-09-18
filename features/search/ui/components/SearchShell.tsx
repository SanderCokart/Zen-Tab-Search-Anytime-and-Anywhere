import type { ComponentChildren } from "preact";
import type { DisplaySettings } from "@/features/settings/model/display-settings";
import { uiScaleStyle } from "@/features/settings/model/ui-scale";
import type { SearchLayout } from "@/features/search/ui/types";

/**
 * The outer frame for both search surfaces. It carries `data-zen-ui`, which is
 * what the size tokens in `shared/ui/styles.css` hang off, plus the two custom
 * properties those tokens are derived from.
 */
export function SearchShell({
  layout,
  onClose,
  displaySettings,
  issueNavigator,
  children,
}: {
  layout: SearchLayout;
  onClose: () => void;
  displaySettings: DisplaySettings;
  issueNavigator?: boolean;
  children: ComponentChildren;
}) {
  const sizeStyle = uiScaleStyle(displaySettings, layout === "popup" ? "popup" : "overlay");

  if (layout === "popup") {
    return (
      <div
        class="flex h-full flex-col"
        data-zen-ui
        style={{ ...sizeStyle, color: displaySettings.textColor }}
      >
        {children}
      </div>
    );
  }

  return (
    <div
      class="bg-zen-overlay flex h-full w-full items-center justify-center backdrop-blur-[8px]"
      onClick={onClose}
      data-zen-ui
      style={{ ...sizeStyle, color: displaySettings.textColor }}
    >
      <div
        class="from-zen-bg to-zen-raised flex h-auto shrink-0 flex-col overflow-hidden rounded-2xl bg-linear-to-br p-[var(--zen-space-3)] shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
        onClick={(event) => event.stopPropagation()}
        data-omnibar
        data-omnibar-aspect={issueNavigator ? "3/2" : "1/1"}
      >
        {children}
      </div>
    </div>
  );
}
