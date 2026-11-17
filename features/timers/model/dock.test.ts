import { describe, expect, it } from "vitest";
import { selectDockTimers, TIMERS_DOCK_LIMIT } from "@/features/timers/model/dock";
import type { TabTimer } from "@/shared/types";

function timer(tabId: number, endAt: number): TabTimer {
  return { timerId: `t${tabId}`, tabId, endAt, title: `Tab ${tabId}`, originalLabel: "", url: "" };
}

describe("selectDockTimers", () => {
  it("shows the soonest timer as the readout and the next two beneath it", () => {
    const timers = [timer(1, 500), timer(2, 100), timer(3, 300), timer(4, 400), timer(5, 200)];
    const { soonest, upcoming } = selectDockTimers(timers);
    expect(TIMERS_DOCK_LIMIT).toBe(3);
    expect(soonest?.tabId).toBe(2);
    expect(upcoming.map((item) => item.tabId)).toEqual([5, 3]);
  });

  it("leaves out nothing when there are fewer timers than the limit", () => {
    const { soonest, upcoming } = selectDockTimers([timer(1, 20), timer(2, 10)]);
    expect(soonest?.tabId).toBe(2);
    expect(upcoming.map((item) => item.tabId)).toEqual([1]);
  });

  it("is empty without timers", () => {
    expect(selectDockTimers([])).toEqual({ soonest: undefined, upcoming: [] });
  });

  it("accepts a custom limit", () => {
    const timers = [timer(1, 1), timer(2, 2), timer(3, 3)];
    expect(selectDockTimers(timers, 1)).toEqual({ soonest: timer(1, 1), upcoming: [] });
  });
});
