import type { SoundVoice } from "@/shared/ui/sound/engine";

/**
 * The voice for a press on a hardware key, small row keys included. Keys that make
 * their own sound (`data-own-sound`: the todo and status latches, the sound test
 * keys) are left out.
 */
export function keyPressVoice(
  target: EventTarget | null,
  release: boolean,
): SoundVoice | undefined {
  const key = target instanceof Element ? target.closest<HTMLElement>(".zs-key") : null;
  if (!key || key.matches(":disabled, [data-own-sound]")) return undefined;
  if (release) return "up";
  return key.classList.contains("zs-key-red") ? "down-primary" : "down";
}
