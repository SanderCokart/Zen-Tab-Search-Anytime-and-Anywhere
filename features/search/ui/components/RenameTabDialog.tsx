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
        class="border-zen-accent bg-zen-panel w-full max-w-sm rounded-lg border p-4 shadow-xl"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(value.replace(/\s+/g, " ").trim());
        }}
      >
        <label class="flex flex-col gap-2 text-sm">
          Rename tab
          <input
            ref={inputRef}
            class="focus:border-zen-accent border-zen-line-strong bg-zen-overlay-soft rounded border px-2 py-1.5 outline-none"
            value={value}
            onInput={(event) => onChange(event.currentTarget.value)}
          />
        </label>
        {error && <p class="text-zen-danger mt-2 mb-0 text-xs">{error}</p>}
        <div class="mt-4 flex justify-end gap-2">
          <button
            type="button"
            class={cn(clearButtonClass, "px-3 py-1.5 text-sm")}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button type="submit" class={cn(primaryButtonClass, "px-3 py-1.5 text-sm")}>
            Save
          </button>
        </div>
      </form>
    </div>
  );
}
