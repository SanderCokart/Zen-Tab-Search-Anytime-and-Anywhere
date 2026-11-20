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
    ...(todos
      ? [{ key: "@", meaning: "Todos", example: "@chores", result: 'Todos containing "chores"' }]
      : []),
    ...(forge
      ? [
          { key: "#", meaning: "Issues", example: "#login", result: 'Issues containing "login"' },
          {
            key: "!",
            meaning: "MRs and PRs",
            example: "!feature",
            result: `PR's / MR's containing "feature"`,
          },
        ]
      : []),
    {
      key: "-",
      meaning: "Hide matches",
      example: "-beta",
      result: 'Does not contain "beta"',
    },
  ];

  return (
    <TooltipButton
      label="Search prefixes"
      data-testid="zen-search-help"
      class="shrink-0 cursor-pointer border-0 bg-transparent p-0 font-mono text-[length:var(--zen-text-sm)] leading-none text-[var(--zs-lcd-dim)] hover:text-[var(--zs-lcd-ink)]"
      tooltip={
        <span class="flex w-full flex-col gap-[var(--zen-space-2)] text-left tracking-[0.08em] text-[var(--zs-tip-ink)] normal-case">
          <span class="flex w-full flex-col gap-[calc(var(--zen-space-1)*0.5)]">
            {hints.map((hint) => (
              <span
                key={hint.key}
                class="flex w-full items-baseline justify-between gap-[var(--zen-space-4)]"
              >
                <span class="zs-label-red font-semibold">{hint.key}</span>
                <span>{hint.meaning}</span>
              </span>
            ))}
          </span>
          <span class="flex w-full flex-col gap-[calc(var(--zen-space-1)*0.5)] border-t border-current/30 pt-[var(--zen-space-2)] opacity-80">
            {hints.map((hint) => (
              <span
                key={hint.key}
                class="flex w-full items-baseline justify-between gap-[var(--zen-space-4)]"
              >
                <span class="whitespace-nowrap">{hint.example}</span>
                <span class="whitespace-nowrap">{hint.result}</span>
              </span>
            ))}
          </span>
        </span>
      }
    >
      ?
    </TooltipButton>
  );
}
