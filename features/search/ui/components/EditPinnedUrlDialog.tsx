import { useEffect, useRef } from "preact/hooks";
import { clearButtonClass, primaryButtonClass } from "@/features/search/ui/lib/styles";
import { cn } from "@/shared/ui/cn";
import { useTypingSound } from "@/shared/ui/sound/useTypingSound";

export interface EditPinnedUrlDialogProps {
  value: string;
  error: string | null;
  onChange: (value: string) => void;
  onSubmit: (url: string) => void;
  onCancel: () => void;
}

/** Modal for editing a pinned or essential tab's stored URL, matching Zen's prompt. */
export function EditPinnedUrlDialog({
  value,
  error,
  onChange,
  onSubmit,
  onCancel,
}: EditPinnedUrlDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const typing = useTypingSound();

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  return (
    <div class="bg-zen-overlay-soft fixed inset-0 z-50 flex items-center justify-center p-4">
      <form
        class="zs-card border-zen-line-medium w-full max-w-sm border p-[var(--zen-space-4)]"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(value.trim());
        }}
      >
        <label class="flex flex-col gap-[var(--zen-space-2)] text-[length:var(--zen-text-md)]">
          Edit pinned URL
          <input
            ref={inputRef}
            class="zs-well focus:border-zen-accent border-zen-line-soft rounded-[var(--zs-r-lcd)] border px-[var(--zen-space-2)] py-[var(--zen-space-2)] font-[inherit] text-inherit outline-none"
            value={value}
            onInput={(event) => onChange(event.currentTarget.value)}
            onKeyDown={typing.onKeyDown}
            onKeyUp={typing.onKeyUp}
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
