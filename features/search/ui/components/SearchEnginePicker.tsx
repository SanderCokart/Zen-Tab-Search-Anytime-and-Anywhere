import {
  SEARCH_ENGINES,
  searchEngineById,
  type SearchEngineId,
} from "@/features/search/model/web-search";
import { cn } from "@/shared/ui/cn";
import { ChevronDownIcon } from "@/shared/ui/primitives/ChevronDownIcon";
import { MenuPanel, useDropdown } from "@/shared/ui/primitives/Menu";
import { useSound } from "@/shared/ui/sound/SoundContext";

export interface SearchEnginePickerProps {
  engineId: SearchEngineId;
  onChange: (engineId: SearchEngineId) => void;
  disabled?: boolean;
}

/**
 * The left end of the search bar: the current engine, and a menu of the rest.
 * Shift+Enter in the field opens a site or searches with this engine.
 */
export function SearchEnginePicker({
  engineId,
  onChange,
  disabled = false,
}: SearchEnginePickerProps) {
  const { play } = useSound();
  const engine = searchEngineById(engineId);

  const dropdown = useDropdown("[data-testid='zen-search-engine-picker']");

  const choose = (id: SearchEngineId) => {
    dropdown.close();
    if (id === engineId) return;
    play("tick");
    onChange(id);
  };

  return (
    <div class="relative shrink-0" data-testid="zen-search-engine-picker">
      <button
        type="button"
        data-testid="zen-search-engine"
        aria-label={`Search engine: ${engine.name}. Shift+Enter opens a site or searches.`}
        aria-haspopup="menu"
        aria-expanded={dropdown.open}
        disabled={disabled}
        class={cn(
          "zs-label zs-label-red inline-flex shrink-0 cursor-pointer items-center gap-[var(--zen-space-1)] leading-none",
          "border-0 bg-transparent p-0 font-[inherit] outline-none",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--zs-red)]",
          disabled && "cursor-not-allowed opacity-50",
        )}
        onClick={dropdown.toggle}
      >
        <span class="select-none">{engine.shortLabel}</span>
        <ChevronDownIcon class="size-[1em] shrink-0" strokeWidth={2.5} roundCaps={false} />
      </button>
      {dropdown.open && (
        <MenuPanel
          align="left"
          class="min-w-[calc(var(--zen-font-size)*10)]"
          data-testid="zen-search-engine-menu"
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
        </MenuPanel>
      )}
    </div>
  );
}
