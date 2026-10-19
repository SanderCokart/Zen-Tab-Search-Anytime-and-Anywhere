import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import { SearchApp } from "@/features/search/ui/SearchApp";
import { sendExtensionMessage, subscribeToOmnibarShown } from "@/shared/messaging/client";
import { formatError, LOG_PREFIX } from "@/shared/log";
import "@/shared/ui/styles.css";

const params = new URLSearchParams(window.location.search);
const overlayId = params.get("overlay") ?? "";
// Built hidden by a preload, this page waits for its first show; built by an
// Alt+F, it mounts straight away and the background shows it without a remount.
const initialSession = params.get("shown") === "1" ? 1 : 0;

function hide() {
  void sendExtensionMessage({ type: "hideOmnibar" }).catch((error: unknown) => {
    console.error(`${LOG_PREFIX} Could not hide the omnibar:`, formatError(error));
  });
}

function OmnibarPage() {
  // Each show remounts the search from scratch: empty query, fresh snapshot.
  const [session, setSession] = useState(initialSession);

  useEffect(
    () =>
      subscribeToOmnibarShown((shownId) => {
        if (shownId !== overlayId) return false;
        setSession((current) => current + 1);
        return true;
      }),
    [],
  );

  if (session === 0) return null;
  return <SearchApp key={session} onClose={hide} pageJump={5} layout="overlay" />;
}

const root = document.getElementById("app");
if (!root) {
  throw new Error("Missing omnibar app mount.");
}

render(<OmnibarPage />, root);
