export type Box = { left: number; right: number; top: number; bottom: number };

/** How far to shift a tooltip so it stays inside `box` with `pad` of air. */
export function clampTooltipNudge(tip: Box, box: Box, pad: number): { x: number; y: number } {
  let x = 0;
  let y = 0;
  if (tip.right > box.right - pad) x -= tip.right - (box.right - pad);
  if (tip.left + x < box.left + pad) x += box.left + pad - (tip.left + x);
  if (tip.bottom > box.bottom - pad) y -= tip.bottom - (box.bottom - pad);
  if (tip.top + y < box.top + pad) y += box.top + pad - (tip.top + y);
  return { x: Math.round(x), y: Math.round(y) };
}
