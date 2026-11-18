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

  it("opens the soonest timer's tab from the readout, and a later one from its row", async () => {
    const onActivate = vi.fn();
    const onEdit = vi.fn();
    const root = document.createElement("div");
    root.setAttribute("data-zen-ui", "");
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
        onClearTimer={() => undefined}
        onActivateTimer={onActivate}
        onEditTimer={onEdit}
      />,
      root,
    );

    root.querySelector<HTMLElement>("[data-testid='zen-timers-dock-soonest']")!.click();
    expect(onActivate).toHaveBeenCalledWith(1);

    onActivate.mockClear();
    const later = [...root.querySelectorAll("li button")].find((button) =>
      button.textContent?.includes("Later"),
    );
    (later as HTMLButtonElement).click();
    expect(onActivate).toHaveBeenCalledWith(2);

    onActivate.mockClear();
    const edit = [...root.querySelectorAll("button")].find(
      (button) => button.textContent === "Edit",
    );
    edit!.click();
    expect(onEdit).toHaveBeenCalledWith(1);
    expect(onActivate).not.toHaveBeenCalled();

    root
      .querySelector("[data-testid='zen-timers-dock-soonest']")!
      .dispatchEvent(new MouseEvent("mouseenter"));
    await vi.waitFor(() =>
      expect(root.querySelector("[role='tooltip']")?.textContent).toBe("Go to this tab"),
    );

    render(null, root);
    root.remove();
  });
});
