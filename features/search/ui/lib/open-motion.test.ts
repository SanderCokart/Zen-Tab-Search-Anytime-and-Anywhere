import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createOpenMotionController,
  isOpenMotionEnabled,
  openMotionHiddenPose,
  usesOpenWhoosh,
} from "@/features/search/ui/lib/open-motion";

interface FakeControl {
  stop: ReturnType<typeof vi.fn>;
  finished: Promise<void>;
  finish: () => void;
}

const animateMock = vi.hoisted(() => vi.fn());

vi.mock("motion", () => ({
  animate: animateMock,
}));

function makeControl(): FakeControl {
  let resolve!: () => void;
  const finished = new Promise<void>((res) => {
    resolve = res;
  });
  return {
    stop: vi.fn(() => resolve()),
    finished,
    finish: () => resolve(),
  };
}

describe("open-motion", () => {
  beforeEach(() => {
    animateMock.mockReset();
  });

  it("maps each edge and zoom to a full-viewport hidden pose", () => {
    expect(openMotionHiddenPose("slide-up")).toEqual({ opacity: 1, x: 0, y: "100vh", scale: 1 });
    expect(openMotionHiddenPose("slide-down")).toEqual({
      opacity: 1,
      x: 0,
      y: "-100vh",
      scale: 1,
    });
    expect(openMotionHiddenPose("slide-right")).toEqual({
      opacity: 1,
      x: "-100vw",
      y: 0,
      scale: 1,
    });
    expect(openMotionHiddenPose("slide-left")).toEqual({
      opacity: 1,
      x: "100vw",
      y: 0,
      scale: 1,
    });
    expect(openMotionHiddenPose("zoom")).toEqual({ opacity: 1, x: 0, y: 0, scale: 0 });
    expect(openMotionHiddenPose("fade")).toEqual({ opacity: 0, x: 0, y: 0, scale: 1 });
  });

  it("disables motion for none or zero duration", () => {
    expect(isOpenMotionEnabled("none", 300)).toBe(false);
    expect(isOpenMotionEnabled("slide-up", 0)).toBe(false);
    expect(isOpenMotionEnabled("slide-up", 300)).toBe(true);
  });

  it("whooshes on fade, slides and zoom, not on none", () => {
    expect(usesOpenWhoosh("slide-up")).toBe(true);
    expect(usesOpenWhoosh("slide-left")).toBe(true);
    expect(usesOpenWhoosh("zoom")).toBe(true);
    expect(usesOpenWhoosh("fade")).toBe(true);
    expect(usesOpenWhoosh("none")).toBe(false);
  });

  it("fades the scrim while sliding the chassis in and out", async () => {
    const scrim = document.createElement("div");
    const chassis = document.createElement("div");
    const controls = [makeControl(), makeControl(), makeControl(), makeControl()];
    let index = 0;
    animateMock.mockImplementation(() => controls[index++]!);

    const controller = createOpenMotionController();
    const enterDone = controller.enter(scrim, chassis, "slide-up", 400);

    expect(animateMock).toHaveBeenNthCalledWith(
      1,
      scrim,
      { opacity: [0, 1] },
      expect.objectContaining({ duration: 0.4 }),
    );
    expect(animateMock).toHaveBeenNthCalledWith(
      2,
      chassis,
      { opacity: [1, 1], x: [0, 0], y: ["100vh", 0], scale: [1, 1] },
      expect.objectContaining({ duration: 0.4 }),
    );
    controls[0]!.finish();
    controls[1]!.finish();
    await enterDone;

    const exitDone = controller.exit(scrim, chassis, "slide-up", 400);
    expect(animateMock).toHaveBeenNthCalledWith(
      3,
      scrim,
      { opacity: 0 },
      expect.objectContaining({ duration: 0.4 }),
    );
    expect(animateMock).toHaveBeenNthCalledWith(
      4,
      chassis,
      { opacity: 1, x: 0, y: "100vh", scale: 1 },
      expect.objectContaining({ duration: 0.4 }),
    );
    controls[2]!.finish();
    controls[3]!.finish();
    await expect(exitDone).resolves.toBe(true);
  });

  it("cancels an in-flight exit when re-opened so the overlay does not hide afterward", async () => {
    const scrim = document.createElement("div");
    const chassis = document.createElement("div");
    const exitScrim = makeControl();
    const exitChassis = makeControl();
    const enterScrim = makeControl();
    const enterChassis = makeControl();
    const queue = [exitScrim, exitChassis, enterScrim, enterChassis];
    animateMock.mockImplementation(() => queue.shift()!);

    const controller = createOpenMotionController();
    const exitPromise = controller.exit(scrim, chassis, "zoom", 300);
    const enterPromise = controller.enter(scrim, chassis, "zoom", 300);

    expect(exitScrim.stop).toHaveBeenCalled();
    expect(exitChassis.stop).toHaveBeenCalled();
    await expect(exitPromise).resolves.toBe(false);

    enterScrim.finish();
    enterChassis.finish();
    await enterPromise;
  });

  it("resets inline opacity and transform immediately when motion is disabled", async () => {
    const scrim = document.createElement("div");
    const chassis = document.createElement("div");
    scrim.style.opacity = "0";
    chassis.style.transform = "translateY(100vh)";

    const controller = createOpenMotionController();
    await controller.enter(scrim, chassis, "none", 300);

    expect(animateMock).not.toHaveBeenCalled();
    expect(scrim.style.opacity).toBe("");
    expect(chassis.style.transform).toBe("");
  });
});
