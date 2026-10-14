import type { TabStatus, TrafficLight } from "@/shared/types";

/** Turns the snapshot's status list into a lookup by tab ID. */
export function statusesByTabId(statuses: TabStatus[]): Map<number, TrafficLight> {
  return new Map(statuses.map((status) => [status.tabId, status.light]));
}

/** The status colors in the order the pickers list them. */
export const TRAFFIC_LIGHT_OPTIONS: { light: TrafficLight; label: string }[] = [
  { light: "red", label: "Red" },
  { light: "orange", label: "Orange" },
  { light: "green", label: "Green" },
];
