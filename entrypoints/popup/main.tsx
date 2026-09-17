import { render } from "preact";
import { SearchApp } from "../../ui/search/SearchApp";
import { ThemeRoot } from "../../ui/theme/ThemeRoot";
import "../../ui/styles.css";

const root = document.getElementById("app");
if (!root) {
  throw new Error("Missing popup app mount.");
}

render(
  <ThemeRoot>
    <SearchApp onClose={() => window.close()} layout="popup" />
  </ThemeRoot>,
  root,
);
