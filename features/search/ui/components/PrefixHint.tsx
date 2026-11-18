import { TooltipLegend, useTooltip } from "@/shared/ui/primitives/Tooltip";

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
        onMouseEnter={(event) => tooltip.showAfterPause(event.currentTarget)}
        onMouseLeave={tooltip.hide}
        onFocus={(event) => tooltip.show(event.currentTarget)}
        onBlur={tooltip.hide}
        onClick={tooltip.hide}
      >
        <strong>{prefixes.join(" / ")}</strong>
        <span class="text-[0px]">{" - "}</span>
      </span>
      {tooltip.anchor && (
        <TooltipLegend content={`${spoken} · ${column}`} anchor={tooltip.anchor} />
      )}
    </>
  );
}
