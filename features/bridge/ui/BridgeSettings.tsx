import { useEffect, useState } from "preact/hooks";
import "@/shared/ui/hardware/field.css";
import { generateBridgeToken, normalizeBridgeToken } from "@/features/bridge/model/token";
import {
  cursorInstallUrl,
  mcpConfigFragment,
  MCP_PATH_PLACEHOLDER,
  MCP_SERVER_FILE_NAME,
  mcpServerDownloadUrl,
  mcpServerReleasePageUrl,
} from "@/features/bridge/model/mcp-install";
import { settingsKeyClass } from "@/shared/ui/button-styles";
import { copyText } from "@/shared/ui/lib/copy-text";
import { Lcd } from "@/shared/ui/primitives/Lcd";
import { FieldText, Module } from "@/shared/ui/primitives/Module";
import { Switch } from "@/shared/ui/primitives/Switch";
import { TooltipLegend, useTooltip } from "@/shared/ui/primitives/Tooltip";
import { BRIDGE_PORT, BRIDGE_TOKEN_STORAGE_KEY } from "@/shared/messaging/bridge-protocol";

/**
 * Opt-in pairing for the local MCP server. Storing a token is what turns the
 * bridge on; the background script reconnects whenever the token changes.
 */
export function BridgeSettings() {
  const [token, setToken] = useState<string | undefined>();
  const [loaded, setLoaded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [configCopied, setConfigCopied] = useState(false);
  // The extension version whose server failed to download, or undefined.
  const [failedVersion, setFailedVersion] = useState<string | undefined>();
  const { anchor, show, hide, showAfterPause } = useTooltip();
  const [tooltip, setTooltip] = useState("");
  const showTip = (content: string, element: HTMLElement) => {
    setTooltip(content);
    showAfterPause(element);
  };
  const showTipNow = (content: string, element: HTMLElement) => {
    setTooltip(content);
    show(element);
  };
  const hideTip = () => {
    setTooltip("");
    hide();
  };

  useEffect(() => {
    void browser.storage.local
      .get(BRIDGE_TOKEN_STORAGE_KEY)
      .then((stored) => setToken(normalizeBridgeToken(stored[BRIDGE_TOKEN_STORAGE_KEY])))
      .finally(() => setLoaded(true));
  }, []);

  const saveToken = (next: string | undefined) => {
    setToken(next);
    setCopied(false);
    void (next
      ? browser.storage.local.set({ [BRIDGE_TOKEN_STORAGE_KEY]: next })
      : browser.storage.local.remove(BRIDGE_TOKEN_STORAGE_KEY));
  };

  const copyToken = () => {
    if (!token) {
      return;
    }
    void copyText(token).then(() => setCopied(true));
  };

  const copyConfig = () => {
    void copyText(mcpConfigFragment()).then(() => setConfigCopied(true));
  };

  // Fetched rather than linked, so a missing asset shows an error here instead of
  // replacing this page with GitHub's 404. `<all_urls>` lets the page read it.
  const downloadServer = async () => {
    setFailedVersion(undefined);
    const extensionVersion = browser.runtime.getManifest().version;
    try {
      const response = await fetch(mcpServerDownloadUrl(extensionVersion));
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = MCP_SERVER_FILE_NAME;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1_000);
    } catch {
      setFailedVersion(extensionVersion);
    }
  };

  return (
    <Module title="AI agents" meta="MCP" wide>
      <Switch
        checked={!!token}
        disabled={!loaded}
        data-testid="zen-bridgeEnabled"
        showState
        onChange={(checked) => saveToken(checked ? generateBridgeToken() : undefined)}
      >
        <FieldText
          label="Let a local MCP server control Zen"
          hint={`Claude, Cursor and other MCP clients can then read and organise your tabs, folders and spaces through the Zen Deck MCP server. It connects only over this computer (127.0.0.1:${BRIDGE_PORT}) and only with the token below.`}
        />
      </Switch>
      {token && (
        <div class="flex flex-col gap-[var(--zen-space-3)]">
          <span class="text-[length:var(--zen-text-sm)] text-[var(--zs-ink-3)]">
            Set <code>ZEN_BRIDGE_TOKEN</code> to this value in your MCP client's config.
          </span>
          <Lcd class="flex items-center gap-[var(--zen-space-3)] px-[var(--zen-space-3)] py-[var(--zen-space-2)]">
            <em class="zs-label zs-label-red not-italic">TOKEN</em>
            <input
              data-kit="input"
              type="text"
              readOnly
              class="min-w-0 flex-1 border-0 bg-transparent p-0 font-mono text-[length:var(--zen-text-md)] text-inherit outline-none"
              data-testid="zen-bridgeToken"
              value={token}
              aria-label="MCP bridge token"
              onFocus={(event) => event.currentTarget.select()}
            />
          </Lcd>
          <div class="flex flex-wrap gap-[var(--zen-space-2)]">
            <button type="button" class={settingsKeyClass} onClick={copyToken}>
              {copied ? "Copied" : "Copy token"}
            </button>
            <button
              type="button"
              class={settingsKeyClass}
              onMouseEnter={(event) =>
                showTip("Disconnects any MCP server still using the old token", event.currentTarget)
              }
              onMouseLeave={hideTip}
              onFocus={(event) =>
                showTipNow(
                  "Disconnects any MCP server still using the old token",
                  event.currentTarget,
                )
              }
              onBlur={hideTip}
              onClick={() => saveToken(generateBridgeToken())}
            >
              New token
            </button>
          </div>
          <div class="flex flex-wrap gap-[var(--zen-space-2)]" data-testid="zen-mcpActions">
            <button
              type="button"
              class={settingsKeyClass}
              data-testid="zen-mcpDownload"
              onClick={() => void downloadServer()}
            >
              Download MCP server
            </button>
            <a
              class={settingsKeyClass}
              role="button"
              data-testid="zen-mcpAddToCursor"
              href={cursorInstallUrl(token)}
              onMouseEnter={(event) =>
                showTip(
                  "Opens Cursor and adds this server. Replace the path placeholder afterwards.",
                  event.currentTarget,
                )
              }
              onMouseLeave={hideTip}
              onFocus={(event) =>
                showTipNow(
                  "Opens Cursor and adds this server. Replace the path placeholder afterwards.",
                  event.currentTarget,
                )
              }
              onBlur={hideTip}
            >
              Add to Cursor
            </a>
            <button
              type="button"
              class={settingsKeyClass}
              data-testid="zen-mcpCopyConfig"
              onMouseEnter={(event) =>
                showTip(
                  "Copies an mcpServers JSON fragment with placeholders for the path and token",
                  event.currentTarget,
                )
              }
              onMouseLeave={hideTip}
              onFocus={(event) =>
                showTipNow(
                  "Copies an mcpServers JSON fragment with placeholders for the path and token",
                  event.currentTarget,
                )
              }
              onBlur={hideTip}
              onClick={copyConfig}
            >
              {configCopied ? "Copied config" : "Copy MCP config"}
            </button>
          </div>
          {anchor && <TooltipLegend anchor={anchor} content={tooltip} />}
          {failedVersion && (
            <span
              class="text-zen-danger text-[length:var(--zen-text-sm)]"
              data-testid="zen-mcpDownloadFailed"
            >
              Download failed. Get <code>{MCP_SERVER_FILE_NAME}</code> from the{" "}
              <a
                href={mcpServerReleasePageUrl(failedVersion)}
                target="_blank"
                rel="noreferrer"
                class="text-inherit underline"
              >
                v{failedVersion} release
              </a>{" "}
              instead.
            </span>
          )}
          <span class="text-[length:var(--zen-text-sm)] text-[var(--zs-ink-3)]">
            Download the server first, then replace <code>{MCP_PATH_PLACEHOLDER}</code> with the
            path to the saved file. Claude Desktop and Claude Code have no link to add a server, so
            use Copy MCP config and paste it into their config, replacing the placeholders.
          </span>
        </div>
      )}
    </Module>
  );
}
