import type { ComponentChildren } from "preact";
import { useId } from "preact/hooks";
import { cn } from "@/shared/ui/cn";
import { Led } from "@/shared/ui/primitives/Led";
import { useSound } from "@/shared/ui/sound/SoundContext";

export interface AccordionProps {
  /** The header text; shown uppercase after the row number. */
  label: ComponentChildren;
  /** Tooltip for a label that may be cut off. */
  title?: string;
  open: boolean;
  onToggle: () => void;
  /** Shown beside the label while the panel is closed. */
  count?: number;
  /** Extra classes for the wrapper, such as a coloured border. */
  class?: string;
  /** Classes for the header button, to adjust its size. */
  triggerClass?: string;
  "data-testid"?: string;
  children?: ComponentChildren;
}

/**
 * A collapsible section in the SPEC-01 style: a numbered, uppercase header with a
 * lamp that is lit while open, over a recessed tray whose height eases open and
 * shut. Nested accordions restart their numbering inside the parent's tray.
 *
 * Closed content stays mounted but `inert`, so it keeps its scroll and state and
 * the browser cannot focus or tab into it.
 */
export function Accordion({
  label,
  title,
  open,
  onToggle,
  count,
  class: className,
  triggerClass,
  "data-testid": testId,
  children,
}: AccordionProps) {
  const { play } = useSound();
  const panelId = useId();

  return (
    <div class={cn("zs-acc min-w-0", className)} data-open={open || undefined} data-testid={testId}>
      <button
        type="button"
        class={cn("zs-acc-trigger", triggerClass)}
        aria-expanded={open}
        aria-controls={panelId}
        title={title}
        onClick={() => {
          play("tick");
          onToggle();
        }}
      >
        <span class="zs-acc-label min-w-0 truncate">{label}</span>
        {!open && count !== undefined && <span class="zs-acc-count zs-digits">{count}</span>}
        <Led on={open} />
      </button>
      <div id={panelId} class="zs-acc-panel" role="region" aria-hidden={!open}>
        <div class="zs-acc-clip" inert={!open}>
          <div class="zs-tray zs-acc-list">{children}</div>
        </div>
      </div>
    </div>
  );
}
