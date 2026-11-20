import { useEffect, useRef } from "preact/hooks";
import { clearButtonClass, primaryButtonClass } from "@/features/search/ui/lib/styles";
import { cn } from "@/shared/ui/cn";
import { Dialog } from "@/shared/ui/primitives/Dialog";
import { useTypingSound } from "@/shared/ui/sound/useTypingSound";

export interface TextPromptDialogProps {
  title: string;
  /** The label above the field. */
  fieldLabel: string;
  value: string;
  error: string | null;
  onChange: (value: string) => void;
  /** Gets the field's value as typed; tidy it (trim, collapse spaces) here. */
  onSubmit: (value: string) => void;
  onCancel: () => void;
}

/** A modal with one text field, focused and selected on open, and Cancel / Save. */
export function TextPromptDialog({
  title,
  fieldLabel,
  value,
  error,
  onChange,
  onSubmit,
  onCancel,
}: TextPromptDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const typing = useTypingSound();

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  return (
    <Dialog
      title={title}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(value);
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
        {fieldLabel}
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
