export default defineBackground(() => {
  console.log("Zen Tab Search background started at", new Date().toISOString());

  browser.commands.onCommand.addListener((command) => {
    console.log("Command received:", command, "at", new Date().toISOString());
    if (command !== "show-omnibar") {
      console.log("Unknown command:", command);
      return;
    }

    browser.tabs
      .query({ active: true, currentWindow: true })
      .then((tabs) => {
        const tabId = tabs[0]?.id;
        if (!Number.isInteger(tabId) || tabId! < 0) {
          console.error("No valid active tab found");
          return;
        }

        console.log("Active tab found:", tabId);
        return browser.tabs.sendMessage(tabId!, { type: "showOmnibar" }).then(() => {
          console.log("showOmnibar message sent successfully to tab:", tabId);
        });
      })
      .catch((error) => {
        console.error("Error handling show-omnibar command:", error);
      });
  });

  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    console.log("Message received in background:", message);

    if (message.type === "getTabs") {
      browser.tabs
        .query({})
        .then((tabs) => {
          sendResponse(
            tabs.map((tab) => ({
              id: tab.id,
              title: tab.title || "Untitled",
              url: tab.url || "",
              favIconUrl: tab.favIconUrl || "",
              windowId: tab.windowId,
            })),
          );
        })
        .catch((error) => {
          console.error("Error querying tabs:", error);
          sendResponse({ error: error.message });
        });
      return true;
    }

    if (message.type === "switchTab") {
      const tabId = message.tabId;
      if (!Number.isInteger(tabId) || tabId < 0) {
        sendResponse({ error: "Invalid tabId" });
        return true;
      }

      browser.tabs
        .get(tabId)
        .then((tab) => {
          if (!tab || !Number.isInteger(tab.windowId)) {
            sendResponse({ error: "Tab or window not found" });
            return;
          }

          return browser.windows.update(tab.windowId, { focused: true }).then(() => {
            return browser.tabs.update(tabId, { active: true }).then(() => {
              sendResponse({ success: true });
            });
          });
        })
        .catch((error) => {
          console.error("Error switching tab:", error);
          sendResponse({ error: error.message });
        });
      return true;
    }

    return false;
  });
});
