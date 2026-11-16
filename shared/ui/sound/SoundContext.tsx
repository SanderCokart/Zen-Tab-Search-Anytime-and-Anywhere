import { createContext, type ComponentChildren } from "preact";
import { useContext, useEffect, useMemo, useRef } from "preact/hooks";
import { createSoundEngine, type SoundEngine, type SoundVoice } from "@/shared/ui/sound/engine";

export interface SoundApi {
  play: (voice: SoundVoice) => void;
}

const SILENT: SoundApi = { play: () => undefined };

const SoundContext = createContext<SoundApi>(SILENT);

/** The sound player; silent outside a {@link SoundProvider}. Call it from event handlers only. */
export function useSound(): SoundApi {
  return useContext(SoundContext);
}

/**
 * One engine per document. The overlay mounts a fresh SearchApp every time it
 * opens; a per-mount engine left a new, never-closed AudioContext behind each
 * time, and the first press in a fresh one could go unheard while it started.
 */
let sharedEngine: SoundEngine | undefined;

function documentEngine(volume: number): SoundEngine {
  sharedEngine ??= createSoundEngine({ volume });
  return sharedEngine;
}

/** Test seam: forget the document engine so the next surface builds its own. */
export function resetSharedSoundEngine(): void {
  sharedEngine = undefined;
}

/**
 * Builds the player for a surface, on the document's one engine; `enabled` and
 * `volume` follow the settings, and a disabled player never touches the audio
 * stack.
 */
export function useSoundEngine({
  enabled,
  volume,
}: {
  enabled: boolean;
  volume: number;
}): SoundApi {
  const engine = useRef<SoundEngine | undefined>(undefined);
  engine.current ??= documentEngine(volume);

  useEffect(() => engine.current?.setVolume(volume), [volume]);

  return useMemo<SoundApi>(
    () => ({
      play: (voice) => {
        if (enabled) engine.current?.play(voice);
      },
    }),
    [enabled],
  );
}

export function SoundProvider({
  sound,
  children,
}: {
  sound: SoundApi;
  children: ComponentChildren;
}) {
  return <SoundContext.Provider value={sound}>{children}</SoundContext.Provider>;
}
