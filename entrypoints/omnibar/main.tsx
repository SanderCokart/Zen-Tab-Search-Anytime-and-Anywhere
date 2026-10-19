import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import { SearchApp } from "@/features/search/ui/SearchApp";
import { sendExtensionMessage, subscribeToOmnibarShown } from "@/shared/messaging/client";
import { formatError, LOG_PREFIX } from "@/shared/log";
import { parseOmnibarView, type OmnibarView } from "@/shared/messaging/protocol";
import "@/shared/ui/styles.css";

const params = new URLSearchParams(window.location.search);
const overlayId = params.get("overlay") ?? "";
// Built hidden by a preload, this page waits for its first show; built by an
// Alt+F, it mounts straight away and the background shows it without a remount.
const initialSession = params.get("shown") === "1" ? 1 : 0;
const initialView = readViewParam(params.get("view"));

function readViewParam(value: string | null): OmnibarView | undefined {
  if (!value) return undefined;
  try {
    return parseOmnibarView(JSON.parse(value));
  } catch {
    return undefined;
  }
}

function hide() {
  void sendExtensionMessage({ type: "hideOmnibar" }).catch((error: unknown) => {
    console.error(`${LOG_PREFIX} Could not hide the omnibar:`, formatError(error));
  });
}

function OmnibarPage() {
  // Each show remounts the search from scratch: empty query, fresh snapshot.
  const [session, setSession] = useState({ id: initialSession, view: initialView });

  useEffect(
    () =>
      subscribeToOmnibarShown((shown) => {
        if (shown.overlayId !== overlayId) return false;
        setSession((current) => ({ id: current.id + 1, view: shown.view }));
        return true;
      }),
    [],
  );

  if (session.id === 0) return null;
  return (
    <SearchApp
      key={session.id}
      onClose={hide}
      pageJump={5}
      layout="overlay"
      initialView={session.view}
    />
  );
}

const root = document.getElementById("app");
if (!root) {
  throw new Error("Missing omnibar app mount.");
}

render(<OmnibarPage />, root);
