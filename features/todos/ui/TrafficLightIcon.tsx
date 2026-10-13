import { trafficLightLampClass } from "@/features/todos/ui/traffic-light";
import type { TrafficLight } from "@/shared/types";
import { cn } from "@/shared/ui/cn";

const LAMPS: { light: TrafficLight; cy: number }[] = [
  { light: "red", cy: 6.5 },
  { light: "orange", cy: 12 },
  { light: "green", cy: 17.5 },
];

/** A traffic light. When `light` is set, that lamp is lit in its color. */
export function TrafficLightIcon({
  light,
  class: className,
}: {
  light?: TrafficLight;
  class?: string;
}) {
  return (
    <svg class={cn("zen-icon", className)} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="7" y="1.5" width="10" height="21" rx="3" />
      {LAMPS.map((lamp) => (
        <circle
          key={lamp.light}
          cx="12"
          cy={lamp.cy}
          r="1.75"
          stroke-width="1.5"
          class={light === lamp.light ? trafficLightLampClass[lamp.light] : undefined}
        />
      ))}
    </svg>
  );
}
