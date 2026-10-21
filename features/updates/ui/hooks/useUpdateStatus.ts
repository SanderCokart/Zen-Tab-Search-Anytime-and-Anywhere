import { useEffect, useState } from "preact/hooks";
import { debugError } from "@/shared/debug";
import { sendExtensionMessage } from "@/shared/messaging/client";
import type { UpdateStatus } from "@/shared/types";

/** The installed version against the newest release, once the background has answered. */
export function useUpdateStatus(): UpdateStatus | undefined {
  const [status, setStatus] = useState<UpdateStatus>();

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

  return status;
}
