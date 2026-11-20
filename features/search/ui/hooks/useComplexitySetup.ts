import { COMPLEXITY_SETUP_DONE_KEY } from "@/features/settings/model/complexity";
import { useStoredValue } from "@/shared/ui/hooks/useStoredValue";

/**
 * Whether the first-run complexity setup has been finished. Counts as done
 * until storage answers (or if it cannot be read), so the card never flashes
 * over a returning user's omnibar.
 */
export function useComplexitySetup(): { setupDone: boolean; completeSetup: () => void } {
  const { value, set } = useStoredValue(
    COMPLEXITY_SETUP_DONE_KEY,
    (raw) => raw === true,
    undefined,
    {
      label: "complexity setup",
      initial: true,
    },
  );
  return { setupDone: value, completeSetup: () => set(true) };
}
