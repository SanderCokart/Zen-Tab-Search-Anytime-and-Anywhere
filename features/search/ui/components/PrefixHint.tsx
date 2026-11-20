import { TooltipFor, tooltipTriggerProps, useTooltip } from "@/shared/ui/primitives/Tooltip";

/**
 * The search prefixes that send the keyboard to a column, shown in bold ahead
 * of its title: `! / # - Issues and requests`.
 */
export function PrefixHint({ prefixes, column }: { prefixes: readonly string[]; column: string }) {
  const spoken = prefixes.join(" or ");
  const tooltip = useTooltip();
  return (
    <>
      <span
        class="text-zen-danger zs-head-glyph shrink-0 whitespace-pre"
        aria-label={`Search prefix: ${spoken}`}
        data-testid="zen-prefix-hint"
        tabIndex={0}
        {...tooltipTriggerProps(tooltip, { hideOnClick: true })}
      >
        <strong>{prefixes.join(" / ")}</strong>
        <span class="text-[0px]">{" - "}</span>
      </span>
      <TooltipFor tooltip={tooltip} content={`${spoken} · ${column}`} />
    </>
  );
}
