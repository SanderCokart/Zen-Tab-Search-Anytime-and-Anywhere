import type { TrafficLight } from "@/shared/types";

/**
 * Class recipes per traffic light. Tailwind only generates classes it can read
 * as whole strings, so each color is spelled out rather than interpolated.
 */
export const trafficLightLampClass: Record<TrafficLight, string> = {
  red: "fill-red-400 stroke-red-400",
  orange: "fill-orange-400 stroke-orange-400",
  green: "fill-green-400 stroke-green-400",
};

export const trafficLightDotClass: Record<TrafficLight, string> = {
  red: "bg-red-400",
  orange: "bg-orange-400",
  green: "bg-green-400",
};

/** A row tinted by its status color, with a stronger tint when selected. */
export const trafficLightRowClass: Record<TrafficLight, { idle: string; selected: string }> = {
  red: { idle: "bg-red-500/15 hover:bg-red-500/25", selected: "bg-red-500/30" },
  orange: { idle: "bg-orange-500/15 hover:bg-orange-500/25", selected: "bg-orange-500/30" },
  green: { idle: "bg-green-500/15 hover:bg-green-500/25", selected: "bg-green-500/30" },
};

/**
 * The background of a tab row, issue entry or todo row: tinted by the tab's
 * status color when it has one, otherwise the usual hover and selected wash.
 */
export function statusRowClass(light: TrafficLight | undefined, selected: boolean): string {
  if (light) {
    return trafficLightRowClass[light][selected ? "selected" : "idle"];
  }
  return selected ? "bg-zen-line-soft" : "hover:bg-zen-line-soft";
}
