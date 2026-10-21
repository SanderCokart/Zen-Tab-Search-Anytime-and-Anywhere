import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { debugError } from "@/shared/debug";
import { sendExtensionMessage } from "@/shared/messaging/client";
import type { UpdateStatus } from "@/shared/types";

/** What the last "Check for updates" click found. */
export type UpdateCheckState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "upToDate" }
  | { kind: "failed" };

/**
 * The installed version against the newest release, once the background has
 * answered, and `check` to ask GitHub now instead of using the stored check.
 */
export function useUpdateStatus() {
  const [status, setStatus] = useState<UpdateStatus>();
  const [checkState, setCheckState] = useState<UpdateCheckState>({ kind: "idle" });
  const statusRef = useRef<UpdateStatus>();
  statusRef.current = status;

  useEffect(() => {
    let cancelled = false;
    void sendExtensionMessage({ type: "getUpdateStatus" })
      .then((next) => {
        if (!cancelled) setStatus(next);
      })
      .catch((error) => debugError("Could not check for updates:", error));
    return () => {
      cancelled = true;
    };
  }, []);

  const check = useCallback(() => {
    const previousCheck = statusRef.current?.checkedAt ?? null;
    setCheckState({ kind: "checking" });
    void sendExtensionMessage({ type: "getUpdateStatus", force: true })
      .then((next) => {
        setStatus(next);
        // A failed check falls back to the stored one, so its time does not move.
        const answered = next.checkedAt !== null && next.checkedAt !== previousCheck;
        setCheckState({ kind: answered ? "upToDate" : "failed" });
      })
      .catch((error) => {
        debugError("Could not check for updates:", error);
        setCheckState({ kind: "failed" });
      });
  }, []);

  return { status, checkState, check };
}
