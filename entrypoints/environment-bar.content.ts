export default defineContentScript({
  matches: ["*://*/*"],
  runAt: "document_idle",
  async main() {
    await injectScript("/inject-environment-bar.js", { keepInDom: true });
  },
});
