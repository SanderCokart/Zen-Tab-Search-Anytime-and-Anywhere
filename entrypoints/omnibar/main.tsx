import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import { createSearchSessionCache, SearchApp } from "@/features/search/ui/SearchApp";
import { replayOpenMotion } from "@/features/search/ui/lib/open-motion";
import { sendExtensionMessage, subscribeToOmnibarShown } from "@/shared/messaging/client";
import { formatError, LOG_PREFIX } from "@/shared/log";
import { parseOmnibarView, type OmnibarView } from "@/shared/messaging/protocol";
import "@/shared/ui/fonts.css";
import "@/shared/ui/styles.css";

const params = new URLSearchParams(window.location.search);
const overlayId = params.get("overlay") ?? "";
// Preload builds this page hidden and leaves it mounted. Alt+F only reveals it.
// `shown=1` means this load is the open itself, so the input takes focus now.
const openedAtLoad = params.get("shown") === "1";
const initialView = readViewParam(params.get("view"));
const sessionCache = createSearchSessionCache();

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
  const [reveal, setReveal] = useState(openedAtLoad ? 1 : 0);
  const [view, setView] = useState(initialView);

  useEffect(
    () =>
      subscribeToOmnibarShown((shown) => {
        if (shown.overlayId !== overlayId) return false;
        replayOpenMotion(document.querySelector("[data-omnibar]"));
        setView(shown.view);
        setReveal((current) => current + 1);
        return true;
      }),
    [],
  );

  return (
    <SearchApp
      onClose={hide}
      pageJump={5}
      layout="overlay"
      initialView={view}
      cache={sessionCache}
      reveal={reveal}
    />
  );
}

const root = document.getElementById("app");
if (!root) {
  throw new Error("Missing omnibar app mount.");
}

render(<OmnibarPage />, root);
