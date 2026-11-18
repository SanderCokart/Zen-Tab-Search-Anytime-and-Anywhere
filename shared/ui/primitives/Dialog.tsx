import type { ComponentChildren, JSX } from "preact";
import "@/shared/ui/hardware/dialog.css";

export function Dialog({
  title,
  children,
  actions,
  onSubmit,
}: {
  title: string;
  children: ComponentChildren;
  actions: ComponentChildren;
  onSubmit: JSX.GenericEventHandler<HTMLFormElement>;
}) {
  return (
    <div data-kit="backdrop" class="zs-dialog-backdrop">
      <form data-kit="dialog" class="zs-dialog" role="dialog" aria-modal="true" onSubmit={onSubmit}>
        <div data-kit="dialog-surface" class="zs-dialog-surface">
          <h2 data-kit="dialog-title" class="zs-dialog-title">
            {title}
          </h2>
          {children}
          <div data-kit="actions" class="zs-dialog-actions">
            {actions}
          </div>
        </div>
      </form>
    </div>
  );
}
