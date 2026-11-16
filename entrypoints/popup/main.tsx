import { render } from "preact";
import { SearchApp } from "@/features/search/ui/SearchApp";
import "@/shared/ui/fonts.css";
import "@/shared/ui/styles.css";

const root = document.getElementById("app");
if (!root) {
  throw new Error("Missing popup app mount.");
}

render(<SearchApp onClose={() => window.close()} layout="popup" />, root);
