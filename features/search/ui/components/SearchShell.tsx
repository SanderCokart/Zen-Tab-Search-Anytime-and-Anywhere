import type { ComponentChildren } from "preact";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import type { DisplaySettings } from "@/features/settings/model/display-settings";
import {
  createOpenMotionController,
  isOpenMotionEnabled,
  type OpenMotionController,
} from "@/features/search/ui/lib/open-motion";
import { useCtrlWheelFontSize } from "@/features/search/ui/hooks/useCtrlWheelFontSize";
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
export type OmnibarChassis = "spotlight" | "fullscreen" | "setup";

export function SearchShell({
  layout,
  onClose,
  onRequestClose,
  displaySettings,
  aspect = "1/1",
  chassis,
  open = true,
  sound,
  /** 0 while the preloaded omnibar is hidden. Increments on each reveal. */
  shownGeneration,
  /** Increments when the overlay should animate out before calling `onClose`. */
  closeRequest = 0,
  children,
}: {
  layout: SearchLayout;
  onClose: () => void;
  onRequestClose?: () => void;
  displaySettings: DisplaySettings;
  aspect?: OmnibarAspect;
  /** Override Spotlight/fullscreen. Setup is a detached first-run card. */
  chassis?: OmnibarChassis;
  open?: boolean;
  /** The sound player for everything inside; silent when left out. */
  sound?: SoundApi;
  shownGeneration?: number;
  closeRequest?: number;
  children: ComponentChildren;
}) {
  const theme = useResolvedTheme(displaySettings.theme);
  const colors = themeColorStyle(theme, displaySettings);
  const backgroundPercent = Math.round(displaySettings.backgroundOpacity * 100);
  // Only the overlay needs the zoom: it holds its size on screen.
  const zoom = usePageZoom(layout === "overlay");
  const [overlay, setOverlay] = useState<HTMLDivElement | null>(null);
  const [scrim, setScrim] = useState<HTMLDivElement | null>(null);
  const [chassisEl, setChassisEl] = useState<HTMLDivElement | null>(null);
  const controller = useRef<OpenMotionController | undefined>(undefined);
  controller.current ??= createOpenMotionController();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const seenGeneration = useRef<number | undefined>(undefined);
  const seenCloseRequest = useRef(closeRequest);
  const playedInPage = useRef(false);
  // Ctrl + wheel changes the font size on the overlay; the popup's size is fixed.
  useCtrlWheelFontSize(overlay, displaySettings, layout === "overlay", sound);

  useEffect(() => () => controller.current?.dispose(), []);

  useLayoutEffect(() => {
    if (layout !== "overlay" || !scrim || !chassisEl) return;
    if (!isOpenMotionEnabled(displaySettings.openTransition, displaySettings.openTransitionMs)) {
      controller.current?.reset(scrim, chassisEl);
      return;
    }
    if (!open || shownGeneration === 0) return;
    if (shownGeneration === undefined) {
      if (playedInPage.current) return;
      playedInPage.current = true;
    } else if (seenGeneration.current === shownGeneration) {
      return;
    } else {
      seenGeneration.current = shownGeneration;
    }
    void controller.current?.enter(
      scrim,
      chassisEl,
      displaySettings.openTransition,
      displaySettings.openTransitionMs,
    );
  }, [
    chassisEl,
    displaySettings.openTransition,
    displaySettings.openTransitionMs,
    layout,
    open,
    scrim,
    shownGeneration,
  ]);

  useLayoutEffect(() => {
    if (layout !== "overlay" || closeRequest === seenCloseRequest.current) return;
    seenCloseRequest.current = closeRequest;
    if (!isOpenMotionEnabled(displaySettings.openTransition, displaySettings.openTransitionMs)) {
      onCloseRef.current();
      return;
    }
    void controller.current
      ?.exit(scrim, chassisEl, displaySettings.openTransition, displaySettings.openTransitionMs)
      .then((finished) => {
        if (finished) onCloseRef.current();
      });
  }, [
    chassisEl,
    closeRequest,
    displaySettings.openTransition,
    displaySettings.openTransitionMs,
    layout,
    scrim,
  ]);

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
      ref={setOverlay}
      class="relative flex h-full w-full items-center justify-center overflow-hidden"
      onContextMenu={(event) => event.preventDefault()}
      data-zen-ui
      data-theme={theme}
      data-omnibar-stage={open ? "open" : "loading"}
      data-open-transition={displaySettings.openTransition}
      style={{
        ...uiScaleStyle(displaySettings, "overlay", zoom),
        "--zs-bg-opacity": String(backgroundPercent / 100),
        colorScheme: theme,
        ...colors,
      }}
    >
      <div
        ref={setScrim}
        class="bg-zen-overlay absolute inset-0"
        data-omnibar-scrim
        onClick={onRequestClose ?? onClose}
        style={{
          // A live backdrop blur is resampled on every hover in Firefox, which
          // drops frames on a high-refresh display. The scrim dims the page on its own.
          backgroundColor: `color-mix(in srgb, var(--zs-scrim) ${backgroundPercent}%, transparent)`,
        }}
      />
      <div
        ref={setChassisEl}
        class="zs-chassis relative z-10 flex min-h-0 shrink-0 flex-col overflow-hidden p-[var(--zen-space-6)] shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
        onClick={(event) => event.stopPropagation()}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        data-omnibar
        data-omnibar-layout={chassis ?? (displaySettings.fullscreen ? "fullscreen" : "spotlight")}
        data-omnibar-aspect={aspect}
      >
        {children}
      </div>
    </div>,
  );
}
