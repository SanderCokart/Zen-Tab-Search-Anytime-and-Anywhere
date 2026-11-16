import type { JSX, Ref } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { cn } from "@/shared/ui/cn";
import { Lcd } from "@/shared/ui/primitives/Lcd";
import { useTypingSound } from "@/shared/ui/sound/useTypingSound";

export interface SearchInputProps {
  inputRef: Ref<HTMLInputElement>;
  compact: boolean;
  initialValue?: string;
  /** Takes the input out of focus and input while a panel such as the timer form has the keyboard. */
  inert?: boolean;
  onQueryChange: (query: string) => void;
  onKeyDown: (event: JSX.TargetedKeyboardEvent<HTMLInputElement>) => void;
}

/**
 * Owns the displayed value so the caret can paint before the parent re-ranks
 * the result list. The query is flushed to the parent on the next frame, or
 * immediately when a key needs the latest value (Enter / arrows).
 */
export function SearchInput({
  inputRef,
  compact,
  initialValue = "",
  inert = false,
  onQueryChange,
  onKeyDown,
}: SearchInputProps) {
  const typing = useTypingSound();
  const [value, setValue] = useState(initialValue);
  const frameRef = useRef<number | undefined>(undefined);
  const queryRef = useRef(value);

  useEffect(() => {
    return () => {
      if (frameRef.current !== undefined) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, []);

  const flushQuery = (next: string) => {
    if (frameRef.current !== undefined) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = undefined;
    }
    if (queryRef.current === next) {
      return;
    }
    queryRef.current = next;
    onQueryChange(next);
  };

  return (
    <Lcd
      class={cn(
        "flex min-w-0 flex-1 items-center gap-[var(--zen-space-3)] px-[var(--zen-space-3)]",
        inert && "opacity-50",
      )}
    >
      {!compact && (
        <span aria-hidden="true" class="zs-label zs-label-red shrink-0 select-none">
          Search
        </span>
      )}
      <input
        ref={inputRef}
        data-testid="zen-search-input"
        type="text"
        placeholder={compact ? "Search…" : "Search tabs and spaces..."}
        inert={inert}
        class={cn(
          "min-w-0 flex-1 border-0 bg-transparent text-inherit caret-[var(--zs-red)] outline-none placeholder:text-[var(--zs-lcd-dim)]",
          "py-[var(--zen-space-3)] font-[inherit] text-[length:var(--zen-text-lg)]",
          compact && "w-full",
        )}
        value={value}
        onInput={(event) => {
          const next = event.currentTarget.value;
          setValue(next);
          if (frameRef.current !== undefined) {
            cancelAnimationFrame(frameRef.current);
          }
          frameRef.current = requestAnimationFrame(() => {
            frameRef.current = undefined;
            flushQuery(next);
          });
        }}
        onKeyDown={(event) => {
          typing.onKeyDown(event);
          if (
            event.key === "Enter" ||
            event.key === "Tab" ||
            event.key === "Escape" ||
            event.key.startsWith("Arrow")
          ) {
            flushQuery(event.currentTarget.value);
          }
          onKeyDown(event);
        }}
        onKeyUp={typing.onKeyUp}
      />
    </Lcd>
  );
}
