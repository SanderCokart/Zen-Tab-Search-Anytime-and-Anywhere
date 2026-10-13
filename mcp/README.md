# Zen Tab Search MCP server

Lets Claude, Cursor and other MCP clients read and organise Zen Browser: list spaces, folders
and tabs, rename tabs, create and rename folders, move tabs into and out of folders, move tabs
between spaces, reorder tabs, set tab timers, and mark tabs as todo or done.

```
MCP client ──stdio──▶ zen-tab-search-mcp ◀──WebSocket (127.0.0.1:47652)── Zen Tab Search extension ──▶ Zen
```

The MCP server listens on loopback only. The extension dials in and must present a token you
generate in its settings, so nothing else on your machine or on the web can drive Zen through it.

## Install

You need the Zen Tab Search extension from the same release (see the main
[installation steps](../README.md#installation)) and [Node.js](https://nodejs.org) 20 or newer.

### 1. Download the server

Every GitHub release has a `zen-tab-search-mcp.mjs` asset: one self-contained file with no
dependencies to install. Put it somewhere stable, because your MCP client will point at this
path.

macOS or Linux:

```bash
mkdir -p ~/.zen-tab-search && curl -fL -o ~/.zen-tab-search/zen-tab-search-mcp.mjs https://github.com/SanderCokart/Zen-Tab-Search-Anytime-and-Anywhere/releases/latest/download/zen-tab-search-mcp.mjs
```

Windows (PowerShell):

```powershell
New-Item -ItemType Directory -Force "$HOME\.zen-tab-search" | Out-Null; Invoke-WebRequest https://github.com/SanderCokart/Zen-Tab-Search-Anytime-and-Anywhere/releases/latest/download/zen-tab-search-mcp.mjs -OutFile "$HOME\.zen-tab-search\zen-tab-search-mcp.mjs"
```

Check it runs. It prints the release version. Replace `<home>` with your home folder, for
example `/Users/you` or `C:/Users/you`:

```bash
node <home>/.zen-tab-search/zen-tab-search-mcp.mjs --version
```

The `latest` link always serves the newest stable release. For a canary, download the asset
from that release's page instead.

### 2. Turn the bridge on in Zen

Open Zen Tab Search's settings, tick **AI agents (MCP) → Let a local MCP server control Zen**,
and copy the token it shows.

### 3. Register the server with your MCP client

Pass the token as `ZEN_BRIDGE_TOKEN` and use the absolute path to the file.

**Claude Code**

```bash
claude mcp add zen-tab-search -e ZEN_BRIDGE_TOKEN=<token> -- node <home>/.zen-tab-search/zen-tab-search-mcp.mjs
```

**Claude Desktop** (`claude_desktop_config.json`) and **Cursor** (`~/.cursor/mcp.json` or a
project's `.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "zen-tab-search": {
      "command": "node",
      "args": ["<home>/.zen-tab-search/zen-tab-search-mcp.mjs"],
      "env": { "ZEN_BRIDGE_TOKEN": "<token>" }
    }
  }
}
```

Desktop apps don't always see the `PATH` from your shell, especially with version managers such
as nvm, mise or fnm. If the client says it cannot find `node`, set `command` to Node's full path
(`which node` on macOS/Linux, `where.exe node` on Windows).

### 4. Check the connection

Ask the agent to call `zen_status`. Within a few seconds of the client starting the server it
should report `"connected": true`. If the server was down for a while, the extension can take up
to a minute to retry. If it isn't connected, the `problem` field says why: wrong token, no
connection yet, another server holding the port, or a version mismatch.

**New token** in the settings disconnects any client still using the old one. Turning the
option off deletes the token, and the extension stops connecting.

### Updating

Update the extension and the server together: install the new release zip in Zen, then run the
download command again and restart your MCP client. When they come from different releases and
the bridge protocol has changed, `zen_status` reports a version mismatch rather than failing
silently.

### Building from source instead

```bash
npm install
npm run mcp:build
```

This writes the same file to `mcp/dist/zen-tab-search-mcp.mjs`. Point your client at that path.

## Tools

| Tool                          | What it does                                                                              |
| ----------------------------- | ----------------------------------------------------------------------------------------- |
| `zen_status`                  | Whether Zen is connected; if not, why (see [Troubleshooting](#troubleshooting))           |
| `zen_list_spaces`             | Spaces with IDs and which one is active                                                   |
| `zen_list_tabs`               | Totals per space and folder, then a page of tabs grouped by space or folder, or flat      |
| `zen_list_folders`            | Folders, including empty ones, with space and parent folder                               |
| `zen_get_selected_tabs`       | Tabs currently multi-selected in the active window                                        |
| `zen_open_tab`                | Open a URL in the background, in a space or straight into a folder                        |
| `zen_open_google_workspace`   | Open Drive, Docs, Sheets, Slides, Calendar or Gmail, skipping any already open there      |
| `zen_activate_tab`            | Focus a tab, switching space if needed                                                    |
| `zen_switch_space`            | Switch the active space                                                                   |
| `zen_rename_tab`              | Set a tab's custom name; an empty name clears it                                          |
| `zen_create_folder`           | Create a folder in a space, or reuse the one with that name; optionally move tabs into it |
| `zen_rename_folder`           | Rename a folder                                                                           |
| `zen_move_tabs_to_folder`     | Move tabs into a folder (and into the folder's space)                                     |
| `zen_remove_tabs_from_folder` | Take tabs out of their folder; they stay in the same space                                |
| `zen_move_tabs_to_space`      | Move tabs to another space without switching to it                                        |
| `zen_move_tab`                | Place a tab directly before or after another tab in the same space                        |
| `zen_list_timers`             | Running tab timers with the tab, its label and when it ends                               |
| `zen_set_timer`               | Set a timer on a tab from the same text the timer field takes, such as `45m` or `tomorrow at 9am` |
| `zen_clear_timer`             | Remove a tab's timer                                                                      |
| `zen_list_todos`              | Tabs marked as todo or done, with title, URL and where they sit                           |
| `zen_set_todo`                | Mark a tab as `todo` or `done`                                                            |
| `zen_clear_todo`              | Remove a tab's todo mark                                                                  |
| `zen_detect_forge_tabs`       | Label every open GitHub and GitLab tab (issue, PR or MR number and title); `dryRun` previews it |

Tool results are JSON. Tab lists leave out favicons, which are large data URLs an agent has no
use for.

### Examples

**How many tabs are open, without listing them.** `zen_list_tabs` with `{ "fields": "counts" }`:

```json
{
  "totalTabs": 42,
  "essentialTabs": 3,
  "tabsBySpace": [
    {
      "spaceId": "{3f2a…}",
      "spaceName": "General",
      "active": true,
      "tabCount": 30,
      "folders": [
        { "folderId": "1712…-42", "folderName": "Google", "path": "Google", "tabCount": 3 }
      ]
    },
    { "spaceId": "{9c41…}", "spaceName": "Work", "tabCount": 9, "folders": [] }
  ]
}
```

Folder counts count each tab in its innermost folder only; `path` shows where that folder sits,
for example `Docs / API`.

**Every tab in one call.** `{ "groupBy": "none", "fields": "titles", "limit": 500 }`. The result
adds `page: { "offset": 0, "limit": 500, "returned": 42, "nextOffset": null }` and a flat `tabs`
list. When `nextOffset` is a number, call again with `offset` set to it.

`zen_list_tabs` options:

| Option     | Values                                                     | Default       |
| ---------- | ---------------------------------------------------------- | ------------- |
| `fields`   | `counts`, `titles`, `titles_urls`, `full`                  | `titles_urls` |
| `groupBy`  | `space`, `folder` (space, then folder), `none` (flat list) | `space`       |
| `limit`    | 1–500 tabs per page                                        | 100           |
| `offset`   | tabs to skip                                               | 0             |
| `spaceId`  | only this space                                            |               |
| `folderId` | only this folder, including its subfolders                 |               |

Essential tabs are shared by every space, so they never appear under a space. They are listed
under `essentials`, marked `"global": true`, and in `full` mode have `"spaceId": null`.

**A Google folder in the General space, with Drive, Docs and Sheets in it.**

1. `zen_list_spaces` to find General's `id`.
2. `zen_create_folder` with `{ "name": "Google", "spaceId": "<General id>" }` returns
   `{ "created": true, "folderId": "1712…-42", … }`. Calling it again returns the same folder
   with `"created": false`.
3. `zen_open_google_workspace` with
   `{ "services": ["drive", "docs", "sheets"], "folderId": "1712…-42" }`:

```json
{
  "target": {
    "spaceId": "{3f2a…}",
    "spaceName": "General",
    "folderId": "1712…-42",
    "folderName": "Google"
  },
  "created": 3,
  "existing": 0,
  "failed": 0,
  "results": [
    {
      "service": "drive",
      "status": "created",
      "tabId": 118,
      "title": "New Tab",
      "url": "https://drive.google.com/",
      "spaceId": "{3f2a…}",
      "spaceName": "General",
      "folderId": "1712…-42",
      "folderName": "Google"
    },
    { "service": "docs", "status": "created", "tabId": 119 },
    { "service": "sheets", "status": "created", "tabId": 120 }
  ]
}
```

(The docs and sheets entries are shortened here; they carry the same fields as drive.)

Run it again and every result is `"existing"` with the same `tabId`s, and no tab is opened. A
service counts as already open when one of its home pages is open in the target folder (or,
without `folderId`, anywhere in the target space). That includes the pages Google redirects to,
such as `/drive/my-drive` or `/mail/u/0/`. A specific document doesn't count as the Docs home
page, and neither does the same service open in another space.

**Open any page into a folder.** `zen_open_tab` with
`{ "url": "https://example.com/article", "folderId": "1712…-42" }` returns
`{ "created": true, "tabId": 121, "title": …, "url": …, "spaceId": …, "folderId": … }`. Leave
out `folderId` to open in the active space, or pass `spaceId`. `activate: true` switches to the
tab. Only `http` and `https` URLs can be opened.

## Behaviour worth knowing

- **Folders hold pinned tabs.** That is Zen's model, so creating a folder with tabs, or opening
  or moving tabs into one, pins them.
- **New tabs open in the background** unless you pass `activate: true`. Their title stays
  "New Tab" until the page loads.
- **Repeating a call is safe** for folder creation, opening Google services, renaming, and
  moving tabs. `zen_open_tab` always opens a new tab.
- **Essential tabs cannot be moved** to a folder or another space.
- **Reordering stays within a space.** Move the tab to the target's space first.
- **Nothing destructive.** The tools cannot close tabs, delete folders, navigate existing tabs,
  or read page contents.
- **One server owns the bridge.** Only one process can listen on port 47652. If two MCP clients
  (say, Claude and Cursor) both start the server, the second one reports who holds the port and
  takes over as soon as that server exits. A server exits on its own when its MCP client closes,
  so an old one can't hold the port forever. `ZEN_BRIDGE_PORT` changes the server's port for
  testing only; the extension always connects to 47652.

## Troubleshooting

`zen_status` reports `connected`, the bridge state, this server's `pid` and `version`, and, when
something is wrong, a `problem` that says what to do:

| `bridge` or `problem`                                 | Meaning and fix                                                                                                                       |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `held`: "held by another zen-tab-search MCP server"   | Another MCP client's server owns the port (`portHolder` has its process ID). Quit that client or remove the server from its config.   |
| `transient`: "briefly unavailable"                    | The port was released moments ago, for example a connection in TIME_WAIT. It retries every second.                                    |
| `other-program`                                       | Something else is using port 47652. Stop that program.                                                                                |
| "has not connected since this server started"         | Zen isn't open, the installed extension has no bridge, or "AI agents (MCP)" is off.                                                   |
| "token does not match ZEN_BRIDGE_TOKEN"               | Copy the token again from the extension's settings, update your MCP config, and restart the client.                                   |
| "Version mismatch"                                    | The extension and the server come from different releases. Install both from the same one.                                            |
| "Zen disconnected at …"                               | Zen closed or restarted; it reconnects within a minute once it is open.                                                               |

## Development

- Releases attach `mcp/dist/zen-tab-search-mcp.mjs` next to the extension zip (see
  `scripts/release.mjs`); `scripts/build-mcp.mjs` stamps the package version into it.
- `mcp/server.ts` is the entry point, `mcp/tools.ts` defines the tools, and
  `mcp/bridge-server.ts` is the WebSocket side.
- The wire protocol shared with the extension lives in `shared/messaging/bridge-protocol.ts`.
  The extension side is `features/bridge/`, and the Zen operations themselves are in
  `public/experiment/zenTabs/api.js`, reached through `features/zen/adapter.ts`.
- To add an operation: add a command to `bridgeCommandSchema`, implement it in the experiment
  (and its `schema.json`), expose it on the adapter, handle it in
  `features/bridge/background/zen-commands.ts`, then register a tool in `mcp/tools.ts`.
