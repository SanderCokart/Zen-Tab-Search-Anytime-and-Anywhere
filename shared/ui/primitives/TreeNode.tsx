import type { ComponentChildren } from "preact";
import { useId } from "preact/hooks";
import { cn } from "@/shared/ui/cn";
import { Led } from "@/shared/ui/primitives/Led";
import { useSound } from "@/shared/ui/sound/SoundContext";

export interface TreeNodeProps {
  /** The uppercase label. */
  label: ComponentChildren;
  /** A muted run in front of the label, such as "GitLab · ". */
  prefix?: ComponentChildren;
  /** A black LCD chip after the label, such as "→ develop". */
  chip?: ComponentChildren;
  open: boolean;
  onToggle: () => void;
  /**
   * When set, the name opens this instead of collapsing. The chevron still
   * folds the group.
   */
  onOpen?: () => void;
  /** Accessible name for {@link onOpen}, such as "Open repository". */
  openLabel?: string;
  count?: number;
  /**
   * Shown under the header while closed, outside the folded panel: the current
   * tab's entry, which a closed group keeps showing.
   */
  peek?: ComponentChildren;
  /** Shows a lamp at the end of the header, lit while open. */
  led?: boolean;
  class?: string;
  "data-testid"?: string;
  children?: ComponentChildren;
}

const iconClass = "zen-icon h-[calc(var(--zen-icon-sm)*0.85)] w-[calc(var(--zen-icon-sm)*0.85)]";

function ToggleIcon({ open }: { open: boolean }) {
  return (
    <span class="zs-tree-toggle" aria-hidden="true">
      <svg class={iconClass} viewBox="0 0 24 24">
        <path d={open ? "m7 10 5 5 5-5" : "m10 7 5 5-5 5"} />
      </svg>
    </span>
  );
}

function LabelText({
  prefix,
  label,
  chip,
}: {
  prefix?: ComponentChildren;
  label: ComponentChildren;
  chip?: ComponentChildren;
}) {
  return (
    <span class="zs-tree-label">
      {prefix && <span class="zs-tree-prefix">{prefix}</span>}
      {label}
      {chip && " "}
    </span>
  );
}

/**
 * A node of the rack tree: a keycap toggle, an uppercase label, a hairline
 * rule and a count, over children indented beneath a dotted guide. The children stay
 * mounted but `inert` while closed, and the height eases between 0fr and 1fr.
 */
export function TreeNode({
  label,
  prefix,
  chip,
  open,
  onToggle,
  onOpen,
  openLabel,
  count,
  peek,
  led,
  class: className,
  "data-testid": testId,
  children,
}: TreeNodeProps) {
  const { play } = useSound();
  const panelId = useId();
  const toggle = () => {
    play("tick");
    onToggle();
  };

  const rest = (
    <>
      {chip && <span class="zs-tree-chip">{chip}</span>}
      <span class="zs-tree-rule" aria-hidden="true" />
      {count !== undefined && <span class="zs-tree-count zs-digits zs-acc-count">{count}</span>}
      {led && <Led on={open} />}
    </>
  );

  return (
    <div class={cn("zs-acc min-w-0", className)} data-open={open || undefined} data-testid={testId}>
      {onOpen ? (
        <div class="zs-tree-bar">
          <button
            type="button"
            class="zs-tree-trigger zs-tree-icon"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={toggle}
          >
            <ToggleIcon open={open} />
          </button>
          <button
            type="button"
            class="zs-tree-project"
            data-testid="zen-forge-open-project"
            aria-label={openLabel}
            onClick={() => {
              play("tick");
              onOpen();
            }}
          >
            <LabelText prefix={prefix} label={label} />
          </button>
          <button
            type="button"
            class="zs-tree-rest"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={toggle}
          >
            {rest}
          </button>
        </div>
      ) : (
        <button
          class="zs-tree-trigger"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={toggle}
        >
          <ToggleIcon open={open} />
          <LabelText prefix={prefix} label={label} chip={chip} />
          {rest}
        </button>
      )}
      {!open && peek && <div class="zs-tree-kids">{peek}</div>}
      <div id={panelId} class="zs-acc-panel" role="region" aria-hidden={!open}>
        <div class="zs-acc-clip" inert={!open}>
          <div class="zs-tree-kids">{children}</div>
        </div>
      </div>
    </div>
  );
}
