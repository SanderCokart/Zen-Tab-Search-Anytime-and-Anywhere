import type { ComponentChildren } from "preact";
import { useId } from "preact/hooks";
import { cn } from "@/shared/ui/cn";
import { Led } from "@/shared/ui/primitives/Led";
import { useSound } from "@/shared/ui/sound/SoundContext";
import { TooltipLegend, useTooltip } from "@/shared/ui/primitives/Tooltip";

export interface TreeNodeProps {
  /** The uppercase label. */
  label: ComponentChildren;
  /** A muted run in front of the label, such as "GitLab · ". */
  prefix?: ComponentChildren;
  /** A black LCD chip after the label, such as "→ develop". */
  chip?: ComponentChildren;
  /** Tooltip for a label that may be cut off. */
  title?: string;
  open: boolean;
  onToggle: () => void;
  count?: number;
  /** Shows a lamp at the end of the header, lit while open. */
  led?: boolean;
  class?: string;
  "data-testid"?: string;
  children?: ComponentChildren;
}

const iconClass = "zen-icon h-[calc(var(--zen-icon-sm)*0.85)] w-[calc(var(--zen-icon-sm)*0.85)]";

/**
 * A node of the rack tree: a keycap toggle (a well while open), a label, a hairline
 * rule and a count, over children indented beneath a dotted guide. The children stay
 * mounted but `inert` while closed, and the height eases between 0fr and 1fr.
 */
export function TreeNode({
  label,
  prefix,
  chip,
  title,
  open,
  onToggle,
  count,
  led,
  class: className,
  "data-testid": testId,
  children,
}: TreeNodeProps) {
  const { play } = useSound();
  const tooltip = useTooltip();
  const panelId = useId();

  return (
    <div class={cn("zs-acc min-w-0", className)} data-open={open || undefined} data-testid={testId}>
      <button
        class="zs-tree-trigger"
        aria-label={typeof title === "string" ? title : undefined}
        aria-expanded={open}
        aria-controls={panelId}
        onMouseEnter={(event) => title && tooltip.showAfterPause(event.currentTarget)}
        onMouseLeave={tooltip.hide}
        onFocus={(event) => title && tooltip.show(event.currentTarget)}
        onBlur={tooltip.hide}
        onClick={() => {
          tooltip.hide();
          play("tick");
          onToggle();
        }}
      >
        <span class="zs-tree-toggle" aria-hidden="true">
          <svg class={iconClass} viewBox="0 0 24 24">
            <path d={open ? "m7 10 5 5 5-5" : "m10 7 5 5-5 5"} />
          </svg>
        </span>
        <span class="zs-tree-label">
          {prefix && <span class="zs-tree-prefix">{prefix}</span>}
          {label}
          {chip && " "}
        </span>
        {chip && <span class="zs-tree-chip">{chip}</span>}
        <span class="zs-tree-rule" aria-hidden="true" />
        {count !== undefined && <span class="zs-tree-count zs-digits zs-acc-count">{count}</span>}
        {led && <Led on={open} />}
      </button>
      {tooltip.anchor && title && <TooltipLegend content={title} anchor={tooltip.anchor} />}
      <div id={panelId} class="zs-acc-panel" role="region" aria-hidden={!open}>
        <div class="zs-acc-clip" inert={!open}>
          <div class="zs-tree-kids">{children}</div>
        </div>
      </div>
    </div>
  );
}
