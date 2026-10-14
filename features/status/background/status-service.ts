import * as v from "valibot";
import type { TabStatus, TrafficLight } from "@/shared/types";
import { TRAFFIC_LIGHTS } from "@/shared/messaging/protocol";
import { createTabSessionValues } from "@/shared/tab-session-values";

/** Tab status colors, kept in each tab's session data. Any tab can have one. */
export function createStatusService() {
  const values = createTabSessionValues<TrafficLight>("tabStatus", v.picklist(TRAFFIC_LIGHTS));

  return {
    /** Sets a tab's status color, or clears it with "none". */
    setStatus: (tabId: number, light: TrafficLight | "none"): Promise<void> =>
      values.set(tabId, light === "none" ? undefined : light),
    /** The status color of each of these tabs that has one. */
    getStatuses: async (tabIds: number[]): Promise<TabStatus[]> =>
      (await values.get(tabIds)).map(({ tabId, value }) => ({ tabId, light: value })),
    hydrate: values.hydrate,
    forget: values.forget,
  };
}

export type StatusService = ReturnType<typeof createStatusService>;
