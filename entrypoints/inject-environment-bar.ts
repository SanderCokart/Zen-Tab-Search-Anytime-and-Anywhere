export default defineUnlistedScript(() => {
  function injectStyles(css: string) {
    const head = document.getElementsByTagName("head")[0];
    if (!head) return;
    const style = document.createElement("style");
    style.type = "text/css";
    style.innerHTML = css;
    head.appendChild(style);
  }

  const nodeInfo = document.querySelector('[type="text/node-info"]');
  const themeInfo = document.querySelector('[type="text/theme-info"]');

  if (
    !nodeInfo ||
    !(
      nodeInfo.textContent?.includes("acceptatie") ||
      nodeInfo.textContent?.includes("web") ||
      nodeInfo.textContent?.includes("backend")
    )
  ) {
    return;
  }

  const footer = document.createElement("div");
  const content = document.createElement("span");
  content.innerText = nodeInfo.textContent || "";
  if (themeInfo?.textContent) {
    content.innerText = `${nodeInfo.textContent} | ${themeInfo.textContent.toLowerCase()}`;
  }

  footer.classList.add("acceptatie__footer");
  content.classList.add("debug-content");
  footer.append(content);
  footer.onclick = function (this: HTMLDivElement) {
    this.parentElement?.removeChild(this);
  };

  document.querySelector("body")?.append(footer);

  const isAcceptatie = nodeInfo.textContent?.includes("acceptatie") ?? false;
  injectStyles(`.acceptatie__footer {
      --bg: #ffff00;
      --stripe: ${isAcceptatie ? "#ffff00" : "#ff0000"};
      --fg: #0000ff;

      color: var(--fg);
      background: repeating-linear-gradient(45deg, var(--bg) 0 10px, var(--stripe) 10px 20px);
      font-weight: bold;
      text-align: center;
      font-size: 18px;
      width: 100%;
      position: fixed;
      bottom: 0;
      left:0;
      z-index:999;

      .debug-content {
        background: var(--bg);
        padding: 2px;
        border-radius: 4px;
      }
    }`);
});
