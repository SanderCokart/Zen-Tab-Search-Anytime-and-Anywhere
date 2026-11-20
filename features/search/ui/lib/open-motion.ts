/** Restarts the omnibar entrance on the full-window stage. */
export function replayOpenMotion(stage: HTMLElement | null): void {
  if (!stage) return;
  const kind = stage.getAttribute("data-open-transition");
  if (!kind || kind === "none") return;
  stage.classList.remove("zs-open-motion");
  // A reflow drops the old animation so the next class add plays it again.
  void stage.offsetWidth;
  stage.classList.add("zs-open-motion");
}
