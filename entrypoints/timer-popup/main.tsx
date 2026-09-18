import { render } from "preact";
import { TimerPopup } from "@/features/timers/ui/TimerPopup";
import "@/shared/ui/styles.css";

const root = document.getElementById("app");
if (!root) {
  throw new Error("Missing timer popup app mount.");
}

const tabId = Number(new URLSearchParams(window.location.search).get("tabId"));
render(<TimerPopup tabId={tabId} onClose={() => window.close()} />, root);
