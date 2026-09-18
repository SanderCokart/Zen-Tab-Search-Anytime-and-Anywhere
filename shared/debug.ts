export const DEBUG = import.meta.env.WXT_DEBUG === "true";

export function debugLog(...args: unknown[]): void {
  if (!DEBUG) {
    return;
  }

  console.log(...args);
}

export function debugWarn(...args: unknown[]): void {
  if (!DEBUG) {
    return;
  }

  console.warn(...args);
}

export function debugError(...args: unknown[]): void {
  if (!DEBUG) {
    return;
  }

  console.error(...args);
}
