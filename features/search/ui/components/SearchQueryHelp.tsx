import { TooltipButton } from "@/features/search/ui/components/TooltipButton";

/**
 * The cheat-sheet for query prefixes, next to the search field: column jumps
 * and chained `-word` excludes.
 */
export function SearchQueryHelp({
  todos = true,
  forge = true,
}: {
  todos?: boolean;
  forge?: boolean;
}) {
  const hints = [
    ...(todos ? [{ key: "@", meaning: "Todos" }] : []),
    ...(forge
      ? [
          { key: "#", meaning: "Issues" },
          { key: "!", meaning: "MRs and PRs" },
        ]
      : []),
    { key: "-word -word", meaning: "Hide matches" },
  ];

  return (
    <TooltipButton
      label="Search prefixes"
      data-testid="zen-search-help"
      class="shrink-0 cursor-pointer border-0 bg-transparent p-0 font-mono text-[length:var(--zen-text-sm)] leading-none text-[var(--zs-lcd-dim)] hover:text-[var(--zs-lcd-ink)]"
      tooltip={
        <span class="flex flex-col gap-[calc(var(--zen-space-1)*0.5)] text-left tracking-[0.08em] text-[var(--zs-tip-ink)] normal-case">
          {hints.map((hint) => (
            <span key={hint.key} class="flex items-baseline gap-[var(--zen-space-2)]">
              <span class="zs-label-red min-w-[11ch] font-semibold">{hint.key}</span>
              <span>{hint.meaning}</span>
            </span>
          ))}
        </span>
      }
    >
      ?
    </TooltipButton>
  );
}
