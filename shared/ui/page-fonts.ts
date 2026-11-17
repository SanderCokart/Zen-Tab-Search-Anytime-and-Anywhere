const STYLE_ID = "zen-deck-fonts";
const WEIGHTS = [400, 500, 600];
// Family name as CSS uses it, and the `fonts/` file prefix the build copies it under.
const FONTS = [
  { family: "IBM Plex Mono", file: "ibm-plex-mono" },
  { family: "Inter", file: "inter" },
];

/**
 * Declares the overlay's fonts (IBM Plex Mono and Inter) in the host page's own document.
 *
 * Firefox ignores `@font-face` inside a shadow root, so the content script's
 * overlay cannot load the font from its injected stylesheet. A font declared on
 * the document is usable from every shadow tree under it, so the rules go there,
 * once, pointing at the extension's own copies of the files (`fonts/`, shipped by
 * `wxt.config.ts` and listed as web-accessible). The overlay falls back to the
 * system monospace font until they load, or if the page's security policy
 * refuses them.
 */
export function injectPageFonts(): void {
  if (document.getElementById(STYLE_ID)) {
    return;
  }
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = FONTS.flatMap(({ family, file }) =>
    WEIGHTS.map((weight) => {
      const url = browser.runtime.getURL(`/fonts/${file}-latin-${weight}-normal.woff2` as never);
      return `@font-face{font-family:"${family}";font-style:normal;font-display:swap;font-weight:${weight};src:url("${url}") format("woff2");}`;
    }),
  ).join(" ");
  (document.head ?? document.documentElement).append(style);
}
