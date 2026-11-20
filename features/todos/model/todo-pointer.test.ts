import { describe, expect, it } from "vitest";
import {
  pointerMovedPastDragThreshold,
  TODO_DRAG_THRESHOLD_PX,
} from "@/features/todos/model/todo-pointer";

describe("todo pointer", () => {
  it("treats a still pointer as a click", () => {
    expect(pointerMovedPastDragThreshold({ x: 10, y: 10 }, { x: 10, y: 10 })).toBe(false);
    expect(
      pointerMovedPastDragThreshold(
        { x: 10, y: 10 },
        { x: 10 + TODO_DRAG_THRESHOLD_PX - 1, y: 10 },
      ),
    ).toBe(false);
  });

  it("treats movement past the threshold as a drag", () => {
    expect(
      pointerMovedPastDragThreshold({ x: 10, y: 10 }, { x: 10, y: 10 + TODO_DRAG_THRESHOLD_PX }),
    ).toBe(true);
  });
});
