import { primaryButtonClass } from "@/features/search/ui/lib/styles";
import type { ComplexityFlags } from "@/features/settings/model/complexity";
import {
  OPEN_TRANSITION_OPTIONS,
  type DisplaySettings,
  type OpenTransition,
} from "@/features/settings/model/display-settings";
import { ComplexitySettings } from "@/features/settings/ui/ComplexitySettings";
import { cn } from "@/shared/ui/cn";
import { Select } from "@/shared/ui/primitives/Select";

export function ComplexitySetupCard({
  settings,
  onChange,
  onOpenTransitionChange,
  onContinue,
}: {
  settings: DisplaySettings;
  onChange: (flags: ComplexityFlags) => void;
  onOpenTransitionChange: (openTransition: OpenTransition) => void;
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
      <div class="flex shrink-0 items-center justify-between gap-[var(--zen-space-4)] pt-[var(--zen-space-5)]">
        <div class="flex flex-col gap-[var(--zen-space-2)]">
          <span class="zs-label !font-normal !text-[var(--zs-ink-3)]">Transition</span>
          <Select
            label="Transition"
            data-testid="zen-setup-open-transition"
            options={OPEN_TRANSITION_OPTIONS}
            value={settings.openTransition}
            onChange={onOpenTransitionChange}
          />
        </div>
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
