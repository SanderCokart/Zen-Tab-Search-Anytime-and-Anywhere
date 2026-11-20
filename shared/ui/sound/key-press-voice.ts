import type { SoundVoice } from "@/shared/ui/sound/engine";

/**
 * The key-down voice for a text field, the same one the search box uses.
 * Shortcuts stay silent; arrow keys tick, and everything that types has a release.
 */
export function typingKeyVoice(event: KeyboardEvent): SoundVoice | undefined {
  if (event.ctrlKey || event.metaKey || event.altKey) return undefined;
  if (event.key === " ") return "type-space";
  if (event.key === "Backspace" || event.key === "Delete") return "type-big";
  if (event.key.length === 1) return "type";
  // Alt+arrows belong to the issue groups, which tick for themselves.
  if (event.key.startsWith("Arrow") && !event.altKey) return "tick";
  return undefined;
}

/** The release of a key that typed. Arrow ticks have no lift. */
export function typingReleaseVoice(event: KeyboardEvent): SoundVoice | undefined {
  const voice = typingKeyVoice(event);
  return voice && voice !== "tick" ? "type-up" : undefined;
}

/**
 * The voice for a press on a hardware key, small row keys included. Keys that make
 * their own sound (`data-own-sound`: the todo and status latches, Mark done,
 * the sound test keys) are left out.
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
