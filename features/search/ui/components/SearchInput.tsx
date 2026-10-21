import type { JSX, Ref } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { cn } from "@/shared/ui/cn";

export interface SearchInputProps {
  inputRef: Ref<HTMLInputElement>;
  compact: boolean;
  initialValue?: string;
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
  onQueryChange,
  onKeyDown,
}: SearchInputProps) {
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
    <input
      ref={inputRef}
      data-testid="zen-search-input"
      type="text"
      placeholder="Search tabs and spaces..."
      class={cn(
        "bg-zen-surface placeholder:text-zen-muted min-w-0 flex-1 border-0 outline-none",
        "rounded-[var(--zen-radius)] p-[var(--zen-space-2)] text-[length:var(--zen-text-lg)]",
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
    />
  );
}
