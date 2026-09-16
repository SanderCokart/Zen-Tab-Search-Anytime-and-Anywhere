import { render } from "preact";
import { SearchApp } from "../../ui/search/SearchApp";

const root = document.getElementById("app");
if (!root) {
  throw new Error("Missing popup app mount.");
}

render(<SearchApp onClose={() => window.close()} />, root);
