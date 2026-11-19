/** Pixels the pointer must travel before a todo row becomes a drag. */
export const TODO_DRAG_THRESHOLD_PX = 8;

/** True once the pointer has left the still-click zone around `origin`. */
export function pointerMovedPastDragThreshold(
  origin: { x: number; y: number },
  point: { x: number; y: number },
): boolean {
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  return dx * dx + dy * dy >= TODO_DRAG_THRESHOLD_PX * TODO_DRAG_THRESHOLD_PX;
}
