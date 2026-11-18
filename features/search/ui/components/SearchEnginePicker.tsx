import { useState } from "preact/hooks";
import {
  SEARCH_ENGINES,
  searchEngineById,
  type SearchEngineId,
} from "@/features/search/model/web-search";
import { useCloseOnOutsideClick } from "@/features/search/ui/hooks/useCloseOnOutsideClick";
import { cn } from "@/shared/ui/cn";
import { useSound } from "@/shared/ui/sound/SoundContext";

export interface SearchEnginePickerProps {
  engineId: SearchEngineId;
  onChange: (engineId: SearchEngineId) => void;
  disabled?: boolean;
}

/**
 * The left end of the search bar: the current engine, and a menu of the rest.
 * Shift+Enter in the field searches with whichever engine this shows.
 */
export function SearchEnginePicker({
  engineId,
  onChange,
  disabled = false,
}: SearchEnginePickerProps) {
  const { play } = useSound();
  const [open, setOpen] = useState(false);
  const engine = searchEngineById(engineId);

  useCloseOnOutsideClick(open, "[data-testid='zen-search-engine-picker']", () => setOpen(false));

  const choose = (id: SearchEngineId) => {
    setOpen(false);
    if (id === engineId) return;
    play("tick");
    onChange(id);
  };

  return (
    <div class="relative shrink-0" data-testid="zen-search-engine-picker">
      <button
        type="button"
        data-testid="zen-search-engine"
        aria-label={`Search engine: ${engine.name}. Shift+Enter searches the web.`}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        class={cn(
          "zs-label zs-label-red inline-flex shrink-0 cursor-pointer items-center gap-[var(--zen-space-1)]",
          "border-0 bg-transparent p-0 font-[inherit] outline-none",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--zs-red)]",
          disabled && "cursor-not-allowed opacity-50",
        )}
        onClick={() => setOpen((current) => !current)}
      >
        <span class="select-none">{engine.shortLabel}</span>
        <svg
          class="size-[var(--zen-icon-sm)] shrink-0"
          viewBox="0 0 24 24"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div
          class={cn(
            "zs-card absolute top-full left-0 z-50 mt-[var(--zen-space-2)]",
            "flex min-w-[calc(var(--zen-font-size)*10)] flex-col p-[var(--zen-space-1)]",
          )}
          data-testid="zen-search-engine-menu"
          role="menu"
          onPointerDown={(event) => event.stopPropagation()}
        >
          {SEARCH_ENGINES.map((option) => (
            <button
              key={option.id}
              type="button"
              role="menuitemradio"
              aria-checked={option.id === engine.id}
              class={cn(
                "zs-label cursor-pointer border-0 bg-transparent px-[var(--zen-space-2)] py-[var(--zen-space-1)] text-left font-[inherit]",
                option.id === engine.id ? "text-[var(--zs-red-ink)]" : "text-[var(--zs-ink-2)]",
              )}
              onClick={() => choose(option.id)}
            >
              {option.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
