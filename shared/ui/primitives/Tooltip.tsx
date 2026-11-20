import type { ComponentChildren, JSX } from "preact";
import { createPortal } from "preact/compat";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { clampTooltipNudge } from "@/shared/ui/primitives/tooltip-layout";
import { useSound } from "@/shared/ui/sound/SoundContext";
import { scheduleTooltipPrint } from "@/shared/ui/sound/tooltip-print";

/** A sweep down the list should not open a tooltip, measure it, and portal it on every row. */
export const TOOLTIP_DELAY_MS = 280;

export type TooltipAnchor = { rect: DOMRect; container: Element };

/**
 * Where the legend sits: centred above the control, flipping below when there
 * is no room at the top. Matches Spec-01's hardware tooltip.
 */
function tooltipStyle(
  { rect, container }: TooltipAnchor,
  nudge: { x: number; y: number },
  capMeasure: boolean,
): JSX.CSSProperties {
  const below = rect.top < 48;
  const gap = 8;
  const pad = 8;
  const bounds = container.getBoundingClientRect();
  const fontSize = Number.parseFloat(getComputedStyle(container).fontSize) || 13;
  const maxWidth = Math.max(
    pad * 10,
    Math.min(
      capMeasure ? fontSize * 22 : Infinity,
      bounds.width - pad * 2,
      window.innerWidth - pad * 2,
    ),
  );
  const shiftX = `calc(-50% + ${nudge.x}px)`;
  const shiftY = below ? `${nudge.y}px` : `calc(-100% + ${nudge.y}px)`;
  return {
    left: `${rect.left + rect.width / 2}px`,
    top: `${below ? rect.bottom + gap : rect.top - gap}px`,
    maxWidth: `${maxWidth}px`,
    transform: `translate(${shiftX}, ${shiftY})`,
  };
}

function printChars(label: string): ComponentChildren {
  let index = 0;
  return label.split(/(\s+)/).map((chunk, chunkIndex) => {
    if (chunk === "") return null;
    const start = index;
    index += chunk.length;
    const chars = [...chunk].map((char, offset) => (
      <span key={offset} class="zs-tip-ch" style={{ "--i": String(start + offset) }}>
        {char}
      </span>
    ));
    return (
      <span key={chunkIndex} class={/^\s+$/.test(chunk) ? "zs-tip-gap" : "zs-tip-word"}>
        {chars}
      </span>
    );
  });
}

export function useTooltip(): {
  anchor: TooltipAnchor | null;
  show: (element: HTMLElement) => void;
  hide: () => void;
  showAfterPause: (element: HTMLElement) => void;
} {
  const [anchor, setAnchor] = useState<TooltipAnchor | null>(null);
  const pending = useRef<number | undefined>(undefined);
  const cancel = () => {
    if (pending.current !== undefined) {
      window.clearTimeout(pending.current);
      pending.current = undefined;
    }
  };
  useEffect(() => cancel, []);
  const show = (element: HTMLElement) =>
    setAnchor({
      rect: element.getBoundingClientRect(),
      container: element.closest("[data-zen-ui]") ?? document.body,
    });
  const hide = () => {
    cancel();
    setAnchor(null);
  };
  const showAfterPause = (element: HTMLElement) => {
    cancel();
    pending.current = window.setTimeout(() => {
      pending.current = undefined;
      show(element);
    }, TOOLTIP_DELAY_MS);
  };
  return { anchor, show, hide, showAfterPause };
}

/**
 * The Spec-01 LCD legend: portalled so a row's overflow cannot clip it. String
 * labels print in one character at a time; richer content is shown as a block.
 */
export function TooltipLegend({
  content,
  anchor,
}: {
  content: ComponentChildren;
  anchor: TooltipAnchor;
}) {
  const { play } = useSound();
  const tipRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [nudge, setNudge] = useState({ x: 0, y: 0 });
  const appliedNudge = useRef({ x: 0, y: 0 });
  useEffect(() => {
    const frame = requestAnimationFrame(() => setOpen(true));
    return () => cancelAnimationFrame(frame);
  }, [anchor]);
  useLayoutEffect(() => {
    const tip = tipRef.current?.getBoundingClientRect();
    if (!tip) return;
    const applied = appliedNudge.current;
    const unnudged = {
      left: tip.left - applied.x,
      right: tip.right - applied.x,
      top: tip.top - applied.y,
      bottom: tip.bottom - applied.y,
    };
    const next = clampTooltipNudge(unnudged, anchor.container.getBoundingClientRect(), 8);
    if (next.x === applied.x && next.y === applied.y) return;
    appliedNudge.current = next;
    setNudge(next);
  }, [anchor, content]);
  useEffect(() => {
    if (!open || typeof content !== "string") return;
    return scheduleTooltipPrint(content, play);
  }, [open, content, play]);

  return createPortal(
    <span
      ref={tipRef}
      role="tooltip"
      class="zs-tip"
      data-open={open || undefined}
      style={tooltipStyle(anchor, nudge, typeof content === "string")}
    >
      {typeof content === "string" ? printChars(content) : content}
    </span>,
    anchor.container,
  );
}

/**
 * Truncated copy that shows the full string on a hardware LCD after a pause.
 * Not a tab stop: put this on text inside a row that already has a focusable
 * control, or on a count that is only hovered.
 */
export function TipText({
  label,
  class: className,
  children,
}: {
  label: string;
  class?: string;
  children: ComponentChildren;
}) {
  const tooltip = useTooltip();
  return (
    <>
      <span
        class={className}
        aria-label={label}
        onMouseEnter={(event) => tooltip.showAfterPause(event.currentTarget)}
        onMouseLeave={tooltip.hide}
        onFocus={(event) => tooltip.show(event.currentTarget)}
        onBlur={tooltip.hide}
      >
        {children}
      </span>
      {tooltip.anchor && <TooltipLegend content={label} anchor={tooltip.anchor} />}
    </>
  );
}

/** True when `element`'s text runs past its box, so an ellipsis hides part of it. */
export function isTextTruncated(element: HTMLElement): boolean {
  return element.scrollWidth > element.clientWidth;
}

/**
 * A row's title that shows the full string on the LCD after a pause, but only
 * while it is cut off. With truncation off the text wraps, so there is no tip.
 */
export function TruncatedTip({
  text,
  truncate,
  class: className,
}: {
  text: string;
  truncate: boolean;
  class?: string;
}) {
  const tooltip = useTooltip();
  if (!truncate) return <span class={className}>{text}</span>;
  return (
    <>
      <span
        class={className}
        onMouseEnter={(event) => {
          if (isTextTruncated(event.currentTarget)) tooltip.showAfterPause(event.currentTarget);
        }}
        onMouseLeave={tooltip.hide}
        onMouseDown={tooltip.hide}
      >
        {text}
      </span>
      {tooltip.anchor && <TooltipLegend content={text} anchor={tooltip.anchor} />}
    </>
  );
}
