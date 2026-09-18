import { useEffect, useRef } from "preact/hooks";
import { clearButtonClass, primaryButtonClass } from "@/features/search/ui/lib/styles";
import type { TabInfo } from "@/shared/types";
import { cn } from "@/shared/ui/cn";

export interface RenameTabDialogProps {
  tab: TabInfo;
  value: string;
  error: string | null;
  onChange: (value: string) => void;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}

/** Modal for renaming a tab's Zen label (or an essential tab's local name). */
export function RenameTabDialog({
  value,
  error,
  onChange,
  onSubmit,
  onCancel,
}: RenameTabDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  return (
    <div class="bg-zen-overlay-soft fixed inset-0 z-50 flex items-center justify-center p-4">
      <form
        class="border-zen-accent bg-zen-panel w-full max-w-sm rounded-[var(--zen-radius-lg)] border p-[var(--zen-space-3)] shadow-xl"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(value.replace(/\s+/g, " ").trim());
        }}
      >
        <label class="flex flex-col gap-[var(--zen-space-2)] text-[length:var(--zen-text-md)]">
          Rename tab
          <input
            ref={inputRef}
            class="focus:border-zen-accent border-zen-line-strong bg-zen-overlay-soft rounded-[var(--zen-radius)] border px-[var(--zen-space-2)] py-[var(--zen-space-1)] outline-none"
            value={value}
            onInput={(event) => onChange(event.currentTarget.value)}
          />
        </label>
        {error && (
          <p class="text-zen-danger mt-[var(--zen-space-2)] mb-0 text-[length:var(--zen-text-xs)]">
            {error}
          </p>
        )}
        <div class="mt-[var(--zen-space-3)] flex justify-end gap-[var(--zen-space-2)]">
          <button
            type="button"
            class={cn(
              clearButtonClass,
              "px-[var(--zen-space-3)] py-[var(--zen-space-1)] text-[length:var(--zen-text-md)]",
            )}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="submit"
            class={cn(
              primaryButtonClass,
              "px-[var(--zen-space-3)] py-[var(--zen-space-1)] text-[length:var(--zen-text-md)]",
            )}
          >
            Save
          </button>
        </div>
      </form>
    </div>
  );
}
