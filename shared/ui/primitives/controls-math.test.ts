import { describe, expect, it } from "vitest";
import {
  angleToOffset,
  angleToValue,
  DIAL_DRAG_RANGE_PX,
  dragValue,
  keyboardValue,
  valueToAngle,
  wheelValue,
} from "@/shared/ui/primitives/dial-math";
import {
  fractionOf,
  snapToStep,
  stepIndex,
  tickCountFor,
} from "@/shared/ui/primitives/slider-math";
import { keyPressVoice } from "@/shared/ui/sound/key-press-voice";

describe("slider math", () => {
  it("measures a value along its range and holds it inside", () => {
    expect(fractionOf(5, 0, 10)).toBe(0.5);
    expect(fractionOf(-3, 0, 10)).toBe(0);
    expect(fractionOf(30, 0, 10)).toBe(1);
    expect(fractionOf(1, 4, 4)).toBe(0);
  });

  it("snaps to the step from the minimum without float noise", () => {
    expect(snapToStep(0.37, 0, 1, 0.05)).toBe(0.35);
    expect(snapToStep(0.78, 0.7, 1.5, 0.05)).toBe(0.8);
    expect(snapToStep(7, 0, 64, 4)).toBe(8);
    expect(snapToStep(99, 0, 64, 4)).toBe(64);
    expect(snapToStep(-4, 10, 22, 1)).toBe(10);
  });

  it("numbers steps so a move inside one step is not a change", () => {
    expect(stepIndex(0.35, 0, 0.05)).toBe(7);
    expect(stepIndex(0.36, 0, 0.05)).toBe(7);
    expect(stepIndex(0.4, 0, 0.05)).toBe(8);
  });

  it("draws one tick per step up to a cap", () => {
    expect(tickCountFor(0, 64, 4)).toBe(17);
    expect(tickCountFor(10, 22, 1)).toBe(13);
    expect(tickCountFor(0, 100, 1)).toBe(21);
  });
});

describe("dial math", () => {
  it("sweeps 270 degrees from the lower left to the lower right", () => {
    expect(valueToAngle(0, 0, 1)).toBe(-135);
    expect(valueToAngle(0.5, 0, 1)).toBe(0);
    expect(valueToAngle(1, 0, 1)).toBe(135);
    expect(angleToValue(0, 0, 1, 0.05)).toBe(0.5);
    expect(angleToValue(-135, 0, 1, 0.05)).toBe(0);
  });

  it("puts the dot straight above the centre at zero degrees", () => {
    const top = angleToOffset(0);
    expect(top.x).toBeCloseTo(0);
    expect(top.y).toBeCloseTo(-1);
    expect(angleToOffset(90).x).toBeCloseTo(1);
  });

  it("turns up when dragged up and down when dragged down", () => {
    expect(dragValue(0.5, -DIAL_DRAG_RANGE_PX / 2, 0, 1, 0.05)).toBe(1);
    expect(dragValue(0.5, DIAL_DRAG_RANGE_PX / 4, 0, 1, 0.05)).toBe(0.25);
    expect(dragValue(0.5, 1, 0, 1, 0.05)).toBe(0.5);
  });

  it("answers to arrows, page keys, Home and End, and ignores the rest", () => {
    expect(keyboardValue("ArrowUp", 0.4, 0, 1, 0.05)).toBe(0.45);
    expect(keyboardValue("ArrowLeft", 0.4, 0, 1, 0.05)).toBe(0.35);
    expect(keyboardValue("PageUp", 0.4, 0, 1, 0.05)).toBe(0.5);
    expect(keyboardValue("PageDown", 0.05, 0, 1, 0.05)).toBe(0);
    expect(keyboardValue("Home", 0.4, 0, 1, 0.05)).toBe(0);
    expect(keyboardValue("End", 0.4, 0, 1, 0.05)).toBe(1);
    expect(keyboardValue("ArrowUp", 1, 0, 1, 0.05)).toBe(1);
    expect(keyboardValue("a", 0.4, 0, 1, 0.05)).toBeUndefined();
  });

  it("steps once per wheel notch", () => {
    expect(wheelValue(-100, 0.4, 0, 1, 0.05)).toBe(0.45);
    expect(wheelValue(100, 0.4, 0, 1, 0.05)).toBe(0.35);
    expect(wheelValue(0, 0.4, 0, 1, 0.05)).toBe(0.4);
  });
});

describe("keyPressVoice", () => {
  const key = (className: string, attributes: Record<string, string> = {}) => {
    const element = document.createElement("button");
    element.className = className;
    for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
    const inner = document.createElement("span");
    element.appendChild(inner);
    return { element, inner };
  };

  it("presses down and springs up on a key, harder for the red one", () => {
    const plain = key("zs-key");
    expect(keyPressVoice(plain.inner, false)).toBe("down");
    expect(keyPressVoice(plain.inner, true)).toBe("up");
    expect(keyPressVoice(key("zs-key zs-key-red").element, false)).toBe("down-primary");
  });

  it("stays quiet for other targets and keys that make their own sound", () => {
    expect(keyPressVoice(document.createElement("div"), false)).toBeUndefined();
    expect(keyPressVoice(null, false)).toBeUndefined();
    expect(keyPressVoice(key("zs-key", { "data-own-sound": "" }).element, false)).toBeUndefined();
    expect(keyPressVoice(key("zs-key", { disabled: "" }).element, false)).toBeUndefined();
  });
});
