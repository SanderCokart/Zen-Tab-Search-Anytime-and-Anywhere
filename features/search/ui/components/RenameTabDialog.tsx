import { useEffect, useRef } from "preact/hooks";
import { clearButtonClass, primaryButtonClass } from "@/features/search/ui/lib/styles";
import type { TabInfo } from "@/shared/types";
import { cn } from "@/shared/ui/cn";
import { Dialog } from "@/shared/ui/primitives/Dialog";
import { useTypingSound } from "@/shared/ui/sound/useTypingSound";

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
  const typing = useTypingSound();

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  return (
    <Dialog
      title="Rename tab"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(value.replace(/\s+/g, " ").trim());
      }}
      actions={
        <>
          <button
            type="button"
            class={cn(clearButtonClass, "text-[length:var(--zen-text-md)]")}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button type="submit" class={cn(primaryButtonClass, "text-[length:var(--zen-text-md)]")}>
            Save
          </button>
        </>
      }
    >
      <label class="flex flex-col gap-[var(--zen-space-2)] text-[length:var(--zen-text-md)]">
        Tab name
        <input
          ref={inputRef}
          class="zs-dialog-field"
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
    </Dialog>
  );
}
