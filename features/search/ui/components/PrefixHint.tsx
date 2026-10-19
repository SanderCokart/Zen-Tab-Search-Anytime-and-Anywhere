/**
 * The search prefixes that send the keyboard to a column, shown in bold ahead
 * of its title: `! / # - Issues and requests`.
 */
export function PrefixHint({ prefixes, column }: { prefixes: readonly string[]; column: string }) {
  const spoken = prefixes.join(" or ");
  return (
    <span
      class="text-zen-muted shrink-0 text-[length:var(--zen-text-base)] whitespace-pre"
      title={`Start your search with ${spoken} to search ${column}`}
      aria-label={`Search prefix: ${spoken}`}
      data-testid="zen-prefix-hint"
    >
      <strong>{prefixes.join(" / ")}</strong>
      {" - "}
    </span>
  );
}
