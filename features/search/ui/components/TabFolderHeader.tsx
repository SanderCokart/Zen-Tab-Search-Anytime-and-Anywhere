import type { ComponentChildren } from "preact";
import { cn } from "@/shared/ui/cn";
import { useSound } from "@/shared/ui/sound/SoundContext";

const chevronClass = "zen-icon h-[calc(var(--zen-icon-sm)*0.85)] w-[calc(var(--zen-icon-sm)*0.85)]";

/**
 * The heading of a tab folder: the forge tree's slim chevron key, then the name,
 * a hairline and the count of tabs inside. It is a button; the mouse-down does not
 * take focus, so the search box keeps it and the arrow keys keep working.
 */
export function TabFolderHeader({
  open,
  sub,
  dim,
  count,
  onToggle,
  children,
}: {
  open: boolean;
  /** A sub-folder: no section number. */
  sub: boolean;
  dim?: boolean;
  count: number;
  onToggle: () => void;
  children: ComponentChildren;
}) {
  const { play } = useSound();

  return (
    <button
      type="button"
      class={cn("zs-section-label zs-folder-header", dim && "opacity-80")}
      data-sub={sub || undefined}
      data-testid="zen-folder-group"
      aria-expanded={open}
      onMouseDown={(event) => event.preventDefault()}
      onClick={(event) => {
        event.stopPropagation();
        play("tick");
        onToggle();
      }}
    >
      <span class="zs-tree-toggle zs-folder-toggle" aria-hidden="true">
        <svg class={chevronClass} viewBox="0 0 24 24">
          <path d={open ? "m7 10 5 5 5-5" : "m10 7 5 5-5 5"} />
        </svg>
      </span>
      {children}
      <span class="zs-section-count zs-digits">{count}</span>
    </button>
  );
}
