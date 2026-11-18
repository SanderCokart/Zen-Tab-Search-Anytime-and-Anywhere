import { primaryButtonClass } from "@/features/search/ui/lib/styles";
import type { ComplexityFlags } from "@/features/settings/model/complexity";
import type { DisplaySettings } from "@/features/settings/model/display-settings";
import { ComplexitySettings } from "@/features/settings/ui/ComplexitySettings";
import { cn } from "@/shared/ui/cn";

export function ComplexitySetupCard({
  settings,
  onChange,
  onContinue,
}: {
  settings: DisplaySettings;
  onChange: (flags: ComplexityFlags) => void;
  onContinue: () => void;
}) {
  return (
    <div class="flex min-h-0 flex-1 flex-col">
      <div class="zen-scroll min-h-0 flex-1 overflow-y-auto pr-[var(--zen-space-3)]">
        <p class="m-0 text-[length:var(--zen-text-base)] leading-relaxed font-semibold text-[var(--zs-ink-1)]">
          Pick a preset, or tick the features you want. You can change this later in Settings.
        </p>
        <div class="mt-[var(--zen-space-5)]">
          <ComplexitySettings settings={settings} onChange={onChange} />
        </div>
      </div>
      <div class="flex shrink-0 justify-end pt-[var(--zen-space-5)]">
        <button
          type="button"
          class={cn(
            primaryButtonClass,
            "min-h-[var(--zen-control)] px-[var(--zen-space-4)] py-[var(--zen-space-2)]",
            "text-[length:var(--zen-text-md)]",
          )}
          data-testid="zen-complexity-continue"
          onClick={onContinue}
        >
          Continue
        </button>
      </div>
    </div>
  );
}
