import type { ComponentChildren } from "preact";
import { cn } from "@/shared/ui/cn";

/** "row": message and keys side by side. "stack": message, extras, then keys, full width of a grid. */
type ConfirmWellLayout = "row" | "stack";

const ROOT_CLASS: Record<ConfirmWellLayout, string> = {
  row: "zs-well mb-[var(--zen-space-2)] flex min-w-0 items-center justify-between gap-[var(--zen-space-2)] rounded-[var(--zs-r-lcd)] p-[var(--zen-space-2)] text-[length:var(--zen-text-sm)]",
  stack:
    "zs-well col-span-full flex min-w-0 flex-col gap-[var(--zen-space-2)] rounded-[var(--zs-r-lcd)] p-[var(--zen-space-2)] text-[length:var(--zen-text-sm)]",
};

const MESSAGE_CLASS: Record<ConfirmWellLayout, string> = {
  row: "min-w-0 truncate",
  stack: "min-w-0",
};

const ACTIONS_CLASS: Record<ConfirmWellLayout, string> = {
  row: "flex shrink-0 items-center gap-[var(--zen-space-2)]",
  stack: "flex shrink-0 items-center justify-end gap-[var(--zen-space-2)]",
};

/**
 * An inline confirmation in a recessed well: a message, a confirm key and
 * Cancel. `children` sit between the message and the keys, for extras such as
 * a "don't ask again" checkbox.
 */
export function ConfirmWell({
  layout,
  label,
  testId,
  message,
  confirmLabel,
  confirmTestId,
  cancelTestId,
  danger = true,
  onConfirm,
  onCancel,
  children,
}: {
  layout: ConfirmWellLayout;
  /** The accessible name of the dialog. */
  label: string;
  testId: string;
  message: ComponentChildren;
  confirmLabel: string;
  confirmTestId: string;
  cancelTestId: string;
  /** Paints the confirm key red. */
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ComponentChildren;
}) {
  return (
    <div class={ROOT_CLASS[layout]} role="alertdialog" aria-label={label} data-testid={testId}>
      <span class={MESSAGE_CLASS[layout]}>{message}</span>
      {children}
      <span class={ACTIONS_CLASS[layout]}>
        <button
          type="button"
          class={cn(
            "zs-key px-[var(--zen-space-2)] font-[inherit] text-[length:var(--zen-text-sm)]",
            danger && "zs-key-red",
          )}
          data-own-sound=""
          data-testid={confirmTestId}
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
        <button
          type="button"
          class="text-zen-subtle hover:text-zen-text cursor-pointer border-0 bg-transparent px-[var(--zen-space-1)] font-[inherit] text-[length:var(--zen-text-sm)] hover:underline"
          data-testid={cancelTestId}
          onClick={onCancel}
        >
          Cancel
        </button>
      </span>
    </div>
  );
}
