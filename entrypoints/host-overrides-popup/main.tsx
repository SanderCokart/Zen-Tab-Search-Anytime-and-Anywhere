import { render } from "preact";
import { HostOverridesPopup } from "@/features/hosts/ui/HostOverridesPopup";
import "@/shared/ui/styles.css";

const root = document.getElementById("app");
if (!root) {
  throw new Error("Missing host overrides popup app mount.");
}

const tabId = Number(new URLSearchParams(window.location.search).get("tabId"));
render(<HostOverridesPopup tabId={tabId} onClose={() => window.close()} />, root);
