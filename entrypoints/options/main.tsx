import { render } from "preact";
import { DisplaySettingsApp } from "@/features/settings/ui/DisplaySettingsApp";
import "@/shared/ui/styles.css";

const root = document.getElementById("app");
if (!root) {
  throw new Error("Missing settings app mount.");
}

render(<DisplaySettingsApp />, root);
