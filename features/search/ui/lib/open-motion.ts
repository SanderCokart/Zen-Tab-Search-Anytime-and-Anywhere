/** Restarts the omnibar entrance on an already-mounted chassis. */
export function replayOpenMotion(chassis: HTMLElement | null): void {
  if (!chassis) return;
  const kind = chassis.getAttribute("data-open-transition");
  if (!kind || kind === "none") return;
  chassis.classList.remove("zs-open-motion");
  // A reflow drops the old animation so the next class add plays it again.
  void chassis.offsetWidth;
  chassis.classList.add("zs-open-motion");
}
