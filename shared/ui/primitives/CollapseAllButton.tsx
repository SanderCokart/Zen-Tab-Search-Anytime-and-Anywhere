import { useSound } from "@/shared/ui/sound/SoundContext";
import { TooltipLegend, useTooltip } from "@/shared/ui/primitives/Tooltip";

/**
 * Collapses every group in a column, or expands them when they are all folded.
 * The todo column has no groups, so it does not get one.
 */
export function CollapseAllButton({
  collapsed,
  onToggle,
  testId,
}: {
  /** True when every group in the column is already collapsed. */
  collapsed: boolean;
  onToggle: () => void;
  testId: string;
}) {
  const { play } = useSound();
  const label = collapsed ? "Expand all" : "Collapse all";
  const tooltip = useTooltip();

  return (
    <>
    <button
      class="text-zen-subtle hover:text-zen-text shrink-0 cursor-pointer border-0 bg-transparent p-0 font-[inherit] tracking-[inherit] whitespace-nowrap uppercase"
      data-testid={testId}
      aria-label={label}
      aria-pressed={collapsed}
      onMouseEnter={(event) => tooltip.showAfterPause(event.currentTarget)}
      onMouseLeave={tooltip.hide}
      onFocus={(event) => tooltip.show(event.currentTarget)}
      onBlur={tooltip.hide}
      onClick={() => {
        tooltip.hide();
        play("tick");
        onToggle();
      }}
    >
      {label}
    </button>
    {tooltip.anchor && <TooltipLegend content={label} anchor={tooltip.anchor} />}
    </>
  );
}
