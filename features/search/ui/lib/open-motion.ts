import { animate, type AnimationPlaybackControlsWithThen } from "motion";
import type { OpenTransition } from "@/features/settings/model/display-settings";

export interface MotionPose {
  opacity: number;
  x: number | string;
  y: number | string;
  scale: number;
}

const ENTER_EASE = [0.2, 0.8, 0.2, 1] as const;
const EXIT_EASE = [0.4, 0, 0.8, 0.2] as const;

export const OPEN_MOTION_SHOWN_POSE: MotionPose = {
  opacity: 1,
  x: 0,
  y: 0,
  scale: 1,
};

/** Whether the user's system asks to skip non-essential motion. */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** True when an open/close transition should actually animate. */
export function isOpenMotionEnabled(kind: OpenTransition, durationMs: number): boolean {
  return kind !== "none" && durationMs > 0 && !prefersReducedMotion();
}

/** Off-screen or collapsed pose the deck starts from on enter and returns to on exit. */
export function openMotionHiddenPose(kind: OpenTransition): MotionPose {
  switch (kind) {
    case "fade":
      return { opacity: 0, x: 0, y: 0, scale: 1 };
    case "slide-up":
      return { opacity: 1, x: 0, y: "100vh", scale: 1 };
    case "slide-down":
      return { opacity: 1, x: 0, y: "-100vh", scale: 1 };
    case "slide-right":
      return { opacity: 1, x: "-100vw", y: 0, scale: 1 };
    case "slide-left":
      return { opacity: 1, x: "100vw", y: 0, scale: 1 };
    case "zoom":
      return { opacity: 1, x: 0, y: 0, scale: 0 };
    case "none":
      return OPEN_MOTION_SHOWN_POSE;
  }
}

function enterKeyframes(from: MotionPose) {
  return {
    opacity: [from.opacity, OPEN_MOTION_SHOWN_POSE.opacity],
    x: [from.x, OPEN_MOTION_SHOWN_POSE.x],
    y: [from.y, OPEN_MOTION_SHOWN_POSE.y],
    scale: [from.scale, OPEN_MOTION_SHOWN_POSE.scale],
  };
}

function exitKeyframes(to: MotionPose) {
  return {
    opacity: to.opacity,
    x: to.x,
    y: to.y,
    scale: to.scale,
  };
}

function clearInlineMotion(element: HTMLElement | null): void {
  if (!element) return;
  element.style.opacity = "";
  element.style.transform = "";
}

export interface OpenMotionController {
  /** Stops running motion and clears inline overrides so the deck shows immediately. */
  reset: (scrim: HTMLElement | null, chassis: HTMLElement | null) => void;
  /** Fades the scrim in and animates the deck in from its chosen edge/scale. */
  enter: (
    scrim: HTMLElement | null,
    chassis: HTMLElement | null,
    kind: OpenTransition,
    durationMs: number,
  ) => Promise<void>;
  /**
   * Fades the scrim out and animates the deck back out. Resolves to true when
   * the exit finishes undisturbed, or false if a newer enter/reset interrupted it.
   */
  exit: (
    scrim: HTMLElement | null,
    chassis: HTMLElement | null,
    kind: OpenTransition,
    durationMs: number,
  ) => Promise<boolean>;
  /** Stops any in-flight animations without clearing styles. */
  dispose: () => void;
}

/**
 * Coordinates Motion enter and exit animations on the overlay scrim and deck
 * chassis. A newer enter or reset supersedes an in-flight exit so re-opening
 * mid-close reverses cleanly without hiding the deck afterward.
 */
export function createOpenMotionController(): OpenMotionController {
  let runId = 0;
  let active: AnimationPlaybackControlsWithThen[] = [];

  const stopActive = () => {
    for (const control of active) control.stop();
    active = [];
  };

  const reset = (scrim: HTMLElement | null, chassis: HTMLElement | null) => {
    runId += 1;
    stopActive();
    clearInlineMotion(scrim);
    clearInlineMotion(chassis);
  };

  const waitAll = async (
    controls: AnimationPlaybackControlsWithThen[],
    id: number,
  ): Promise<boolean> => {
    await Promise.all(controls.map((control) => control.finished.catch(() => undefined)));
    if (runId !== id) return false;
    active = [];
    return true;
  };

  const enter = async (
    scrim: HTMLElement | null,
    chassis: HTMLElement | null,
    kind: OpenTransition,
    durationMs: number,
  ): Promise<void> => {
    if (!isOpenMotionEnabled(kind, durationMs)) {
      reset(scrim, chassis);
      return;
    }
    const id = ++runId;
    stopActive();
    const duration = durationMs / 1000;
    const controls: AnimationPlaybackControlsWithThen[] = [];
    if (scrim) {
      controls.push(animate(scrim, { opacity: [0, 1] }, { duration, ease: ENTER_EASE }));
    }
    if (chassis) {
      controls.push(
        animate(chassis, enterKeyframes(openMotionHiddenPose(kind)), {
          duration,
          ease: ENTER_EASE,
        }),
      );
    }
    active = controls;
    await waitAll(controls, id);
  };

  const exit = async (
    scrim: HTMLElement | null,
    chassis: HTMLElement | null,
    kind: OpenTransition,
    durationMs: number,
  ): Promise<boolean> => {
    if (!isOpenMotionEnabled(kind, durationMs)) {
      reset(scrim, chassis);
      return true;
    }
    const id = ++runId;
    stopActive();
    const duration = durationMs / 1000;
    const controls: AnimationPlaybackControlsWithThen[] = [];
    if (scrim) {
      controls.push(animate(scrim, { opacity: 0 }, { duration, ease: EXIT_EASE }));
    }
    if (chassis) {
      controls.push(
        animate(chassis, exitKeyframes(openMotionHiddenPose(kind)), {
          duration,
          ease: EXIT_EASE,
        }),
      );
    }
    active = controls;
    return waitAll(controls, id);
  };

  const dispose = () => {
    runId += 1;
    stopActive();
  };

  return { reset, enter, exit, dispose };
}
