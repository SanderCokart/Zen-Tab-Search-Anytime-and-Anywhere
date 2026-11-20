/** The down chevron on selects and dropdown triggers; sized and coloured by its caller. */
export function ChevronDownIcon({
  class: className,
  strokeWidth = 2,
  roundCaps = true,
}: {
  class?: string;
  strokeWidth?: number;
  /** Round line ends and joins; off, the ends stay square. */
  roundCaps?: boolean;
}) {
  return (
    <svg class={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        stroke-linecap={roundCaps ? "round" : undefined}
        stroke-linejoin={roundCaps ? "round" : undefined}
        stroke-width={strokeWidth}
        d="M6 9l6 6 6-6"
      />
    </svg>
  );
}
