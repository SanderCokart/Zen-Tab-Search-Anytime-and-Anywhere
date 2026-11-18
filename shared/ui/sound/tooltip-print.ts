import type { SoundVoice } from "@/shared/ui/sound/engine";

/** Must match `.zs-tip[data-open] .zs-tip-ch { transition-delay: calc(var(--i) * 28ms) }`. */
export const TOOLTIP_PRINT_MS = 28;

/** Chip 3: the arcade square bloop. */
export const TOOLTIP_PRINT_VOICE: SoundVoice = "print-8";

export function tooltipPrintSchedule(
  label: string,
  reducedMotion: boolean,
): { at: number; voice: SoundVoice }[] {
  if (reducedMotion || label.length === 0) return [];
  return [...label].map((_, index) => ({
    at: index * TOOLTIP_PRINT_MS,
    voice: TOOLTIP_PRINT_VOICE,
  }));
}

const PRINT_PREVIEW_TICKS = 8;

/** Plays a short LCD stagger of one print voice. */
export function previewPrint(
  play: (voice: SoundVoice) => void,
  voice: SoundVoice,
  ticks = PRINT_PREVIEW_TICKS,
): () => void {
  const ids = Array.from({ length: ticks }, (_, index) =>
    window.setTimeout(() => play(voice), index * TOOLTIP_PRINT_MS),
  );
  return () => {
    for (const id of ids) window.clearTimeout(id);
  };
}

/** Plays a key click as each LCD character prints in. Clears on leave. */
export function scheduleTooltipPrint(
  label: string,
  play: (voice: SoundVoice) => void,
  reducedMotion = typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches,
): () => void {
  const ids = tooltipPrintSchedule(label, reducedMotion).map(({ at, voice }) =>
    window.setTimeout(() => play(voice), at),
  );
  return () => {
    for (const id of ids) window.clearTimeout(id);
  };
}
