import { useSound } from "@/shared/ui/sound/SoundContext";

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

  return (
    <button
      type="button"
      class="text-zen-subtle hover:text-zen-text shrink-0 cursor-pointer border-0 bg-transparent p-0 font-[inherit] tracking-[inherit] whitespace-nowrap uppercase"
      data-testid={testId}
      aria-pressed={collapsed}
      title={label}
      onClick={() => {
        play("tick");
        onToggle();
      }}
    >
      {label}
    </button>
  );
}
