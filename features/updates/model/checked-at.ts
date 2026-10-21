/** "Last checked 5 minutes ago", for the check-for-updates button's tooltip. */
export function formatLastChecked(checkedAt: number | null, now: number): string {
  if (checkedAt === null) {
    return "Not checked yet";
  }
  const minutes = Math.floor(Math.max(0, now - checkedAt) / 60_000);
  if (minutes < 1) {
    return "Last checked just now";
  }
  const [count, unit] =
    minutes < 60
      ? [minutes, "minute"]
      : minutes < 48 * 60
        ? [Math.floor(minutes / 60), "hour"]
        : [Math.floor(minutes / (24 * 60)), "day"];
  return `Last checked ${count} ${unit}${count === 1 ? "" : "s"} ago`;
}
