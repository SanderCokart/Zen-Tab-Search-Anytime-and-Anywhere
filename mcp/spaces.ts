/** A space with the same name, ignoring case and surrounding spaces. */
export function findReusableSpace<T extends { id: string; name: string }>(
  spaces: T[],
  name: string,
): T | undefined {
  const wanted = name.trim().toLowerCase();
  return spaces.find((space) => space.name.trim().toLowerCase() === wanted);
}
