import { render } from "preact";
import { DisplaySettingsApp } from "../../ui/settings/DisplaySettingsApp";
import { ThemeRoot } from "../../ui/theme/ThemeRoot";
import "../../ui/styles.css";

const root = document.getElementById("app");
if (!root) {
  throw new Error("Missing settings app mount.");
}

render(
  <ThemeRoot>
    <DisplaySettingsApp />
  </ThemeRoot>,
  root,
);
