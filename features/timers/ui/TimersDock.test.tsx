import { render } from "preact";
import { describe, expect, it, vi } from "vitest";
import { TimersDock } from "@/features/timers/ui/TimersDock";
import type { TabTimer } from "@/shared/types";

function timer(partial: Pick<TabTimer, "tabId" | "title" | "endAt">): TabTimer {
  return { timerId: String(partial.tabId), originalLabel: "", url: "", ...partial };
}

describe("TimersDock", () => {
  it("puts quiet edit and clear on the soonest readout", () => {
    const onEdit = vi.fn();
    const onClear = vi.fn();
    const root = document.createElement("div");
    document.body.appendChild(root);
    render(
      <TimersDock
        timers={
          new Map([
            [1, timer({ tabId: 1, title: "Soon", endAt: Date.now() + 60_000 })],
            [2, timer({ tabId: 2, title: "Later", endAt: Date.now() + 3_600_000 })],
          ])
        }
        onClearAll={() => undefined}
        onClearTimer={onClear}
        onActivateTimer={() => undefined}
        onEditTimer={onEdit}
      />,
      root,
    );

    const soonest = root.querySelector("[data-testid='zen-timers-dock-soonest']");
    const actions = [...(soonest?.querySelectorAll("button") ?? [])];
    expect(actions.map((button) => button.textContent)).toEqual(["Edit", "Clear"]);
    expect(soonest?.querySelector(".zs-key")).toBeNull();

    actions[0]!.click();
    actions[1]!.click();
    expect(onEdit).toHaveBeenCalledWith(1);
    expect(onClear).toHaveBeenCalledWith(1);

    render(null, root);
    root.remove();
  });
});
