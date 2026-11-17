import type { ComponentChildren } from "preact";
import type { DisplaySettings } from "@/features/settings/model/display-settings";
import { themeColorStyle } from "@/features/settings/model/theme-colors";
import { uiScaleStyle } from "@/features/settings/model/ui-scale";
import type { SearchLayout } from "@/features/search/ui/types";
import { SoundProvider, type SoundApi } from "@/shared/ui/sound/SoundContext";
import { keyPressVoice } from "@/shared/ui/sound/key-press-voice";
import { usePageZoom } from "@/features/search/ui/hooks/usePageZoom";
import { useResolvedTheme } from "@/shared/ui/theme";

/**
 * The outer frame for both search surfaces.
 *
 * The overlay carries `data-zen-ui` and `uiScaleStyle`, so font size, density,
 * and the gap sliders drive the tokens in `shared/ui/styles.css`. The toolbar
 * popup carries `data-zen-ui="popup"`, which pins those tokens to a fixed
 * compact size and never reads the sliders. Custom colours still apply.
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
  sound,
  children,
}: {
  layout: SearchLayout;
  onClose: () => void;
  displaySettings: DisplaySettings;
  aspect?: OmnibarAspect;
  open?: boolean;
  /** The sound player for everything inside; silent when left out. */
  sound?: SoundApi;
  children: ComponentChildren;
}) {
  const theme = useResolvedTheme(displaySettings.theme);
  const colors = themeColorStyle(theme, displaySettings);
  const backgroundPercent = Math.round(displaySettings.backgroundOpacity * 100);
  // Only the overlay, and only when it should hold its size on screen, needs the zoom.
  const zoom = usePageZoom(layout === "overlay" && !displaySettings.respectZoom);

  // Presses are heard on the way down and up, from one listener for the whole surface.
  const onPointerDown = (event: PointerEvent) => {
    const voice = keyPressVoice(event.target, false);
    if (voice) sound?.play(voice);
  };
  const onPointerUp = (event: PointerEvent) => {
    const voice = keyPressVoice(event.target, true);
    if (voice) sound?.play(voice);
  };

  const frame = (content: ComponentChildren) =>
    sound ? <SoundProvider sound={sound}>{content}</SoundProvider> : <>{content}</>;

  if (layout === "popup") {
    return frame(
      <div
        class="zs-chassis flex h-full min-h-0 flex-col p-[var(--zen-space-2)]"
        data-zen-ui="popup"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onContextMenu={(event) => event.preventDefault()}
        data-theme={theme}
        style={{ colorScheme: theme, ...colors }}
      >
        {children}
      </div>,
    );
  }

  return frame(
    <div
      class="bg-zen-overlay flex h-full w-full items-center justify-center"
      onClick={onClose}
      onContextMenu={(event) => event.preventDefault()}
      data-zen-ui
      data-theme={theme}
      data-omnibar-stage={open ? "open" : "loading"}
      style={{
        ...uiScaleStyle(displaySettings, "overlay", zoom),
        "--zs-bg-opacity": String(backgroundPercent / 100),
        backgroundColor: `color-mix(in srgb, var(--zs-scrim) ${backgroundPercent}%, transparent)`,
        backdropFilter: `blur(${(backgroundPercent / 100) * 8}px)`,
        colorScheme: theme,
        ...colors,
      }}
    >
      <div
        class="zs-chassis flex min-h-0 shrink-0 flex-col overflow-hidden rounded-[var(--zs-r-card)] p-[var(--zen-space-6)] shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
        onClick={(event) => event.stopPropagation()}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        data-omnibar
        data-omnibar-aspect={aspect}
      >
        {children}
      </div>
    </div>,
  );
}
