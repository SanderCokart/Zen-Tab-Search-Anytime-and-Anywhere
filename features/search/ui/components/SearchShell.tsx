import type { ComponentChildren } from "preact";
import type { DisplaySettings } from "@/features/settings/model/display-settings";
import { uiScaleStyle } from "@/features/settings/model/ui-scale";
import type { SearchLayout } from "@/features/search/ui/types";

/**
 * The outer frame for both search surfaces.
 *
 * The overlay carries `data-zen-ui` and `uiScaleStyle`, so font size, density,
 * and the gap sliders drive the tokens in `shared/ui/styles.css`. The toolbar
 * popup carries `data-zen-ui="popup"`, which pins those tokens to a fixed
 * compact size and never reads the sliders. It only takes the text colour.
 */
/**
 * Overlay shape by column count: one tab column is square, two (tabs and
 * todos) is 3:2, and three (tabs, issues and todos) is 2:1.
 */
export type OmnibarAspect = "1/1" | "3/2" | "2/1";

export function SearchShell({
  layout,
  onClose,
  displaySettings,
  aspect = "1/1",
  open = true,
  children,
}: {
  layout: SearchLayout;
  onClose: () => void;
  displaySettings: DisplaySettings;
  aspect?: OmnibarAspect;
  open?: boolean;
  children: ComponentChildren;
}) {
  if (layout === "popup") {
    return (
      <div
        class="flex h-full min-h-0 flex-col"
        data-zen-ui="popup"
        style={{ color: displaySettings.textColor }}
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
      data-omnibar-stage={open ? "open" : "loading"}
      style={{ ...uiScaleStyle(displaySettings, "overlay"), color: displaySettings.textColor }}
    >
      <div
        class="from-zen-bg to-zen-raised flex min-h-0 shrink-0 flex-col overflow-hidden rounded-2xl bg-linear-to-br p-[var(--zen-space-3)] shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
        onClick={(event) => event.stopPropagation()}
        data-omnibar
        data-omnibar-aspect={aspect}
      >
        {children}
      </div>
    </div>
  );
}
