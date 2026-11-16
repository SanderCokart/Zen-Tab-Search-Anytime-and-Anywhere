import { typingKeyVoice, typingReleaseVoice } from "@/shared/ui/sound/key-press-voice";
import { useSound } from "@/shared/ui/sound/SoundContext";

/** Key handlers that play the search field's typing sounds. */
export function useTypingSound() {
  const { play } = useSound();
  return {
    onKeyDown(event: KeyboardEvent) {
      const voice = typingKeyVoice(event);
      if (voice) play(voice);
    },
    onKeyUp(event: KeyboardEvent) {
      const voice = typingReleaseVoice(event);
      if (voice) play(voice);
    },
  };
}
