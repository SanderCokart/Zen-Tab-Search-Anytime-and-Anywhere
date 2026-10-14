# Zen Tab Search MCP server

Lets Claude, Cursor and other MCP clients read and organise Zen Browser: list spaces, folders
and tabs, create and rename spaces, create nested folders, apply a PATCH-style layout tree,
move tabs and folders, mark tabs essential, close tabs, delete empty folders and spaces, set
tab timers, mark tabs as todo and tick them off, and set tab colors. Most write tools take
id arrays.

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

## Remote agents over SSH

Use this when the agent runs on another machine, such as a Linux server, and Zen runs on your
own computer. The bridge always connects to `127.0.0.1:47652` on the machine where Zen runs, so
an SSH tunnel carries that port from your computer to the server:

```
Server:    Claude / Cursor ─▶ zen-tab-search-mcp ◀─ 127.0.0.1:47652 ─┐
                                                                     │  SSH tunnel
Your PC:   Zen Tab Search extension ─▶ 127.0.0.1:47652 ──────────────┘
```

The bridge stays on loopback at both ends, so nothing on the network can reach it directly.

### Requirements

- Zen, the extension and the bridge (step 2 above) are on your computer, with the token copied.
- The server has `zen-tab-search-mcp.mjs` (step 1) and its client is registered with the same
  token (step 3). Use the server's paths, not your computer's.
- You can log in to the server with an SSH key and no password prompt. Background tunnels can't
  answer a prompt, so set up key-based login first.
- Your computer runs no other zen-tab-search server on port 47652. A local MCP client that is
  still running holds that port, and the tunnel then fails to bind. Quit it, or remove
  zen-tab-search from its config, before you start the tunnel.

### 1. Set up the tunnel

Add a host entry to `~/.ssh/config` on your computer (`%USERPROFILE%\.ssh\config` on Windows).
Replace the placeholders with your server's address and login name:

```
Host zen-bridge
    HostName <server>
    User <user>
    LocalForward 47652 127.0.0.1:47652
    ExitOnForwardFailure yes
    ServerAliveInterval 30
```

Run the tunnel once in a terminal. The first time, ssh asks you to accept the server's host key:

```bash
ssh -N zen-bridge
```

The command stays in the foreground and prints nothing while the tunnel is open. Leave it running,
or stop it with Ctrl+C. `ExitOnForwardFailure` makes ssh exit with an error when port 47652 is
already in use, instead of quietly opening a session without the forward.

Once the tunnel is up, Zen connects by itself. The extension retries every few seconds, slowing to
once a minute while nothing answers.

### 2. Keep the tunnel running

Running `ssh -N zen-bridge` by hand works only while the terminal stays open. These steps start it
at login and restart it if the connection drops.

**Windows.** Run this in PowerShell once. It registers a task that starts the tunnel at logon and
restarts it every minute if ssh exits. It uses the OpenSSH client that ships with Windows 10 and 11;
if `ssh.exe` isn't there, install the "OpenSSH Client" optional feature.

```powershell
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -WindowStyle Hidden -Command `"& 'C:\Windows\System32\OpenSSH\ssh.exe' -N -o BatchMode=yes zen-bridge`""
$trigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName 'Zen MCP SSH Tunnel' -Action $action -Trigger $trigger -Settings $settings -Description 'Forwards the Zen Tab Search MCP bridge port to the server.'
Start-ScheduledTask -TaskName 'Zen MCP SSH Tunnel'
```

To remove it: `Unregister-ScheduledTask -TaskName 'Zen MCP SSH Tunnel' -Confirm:$false`.

**macOS.** Find the path to ssh with `which ssh`, then save this as
`~/Library/LaunchAgents/com.zen-tab-search.tunnel.plist`. Replace `/usr/bin/ssh` if `which` printed
something else.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.zen-tab-search.tunnel</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/ssh</string>
    <string>-N</string>
    <string>zen-bridge</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
</dict>
</plist>
```

Load it with `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.zen-tab-search.tunnel.plist`.
To stop it, run `launchctl bootout gui/$(id -u)/com.zen-tab-search.tunnel`. If your key has a
passphrase, add `AddKeysToAgent yes` and `UseKeychain yes` to the `zen-bridge` host entry, and run
`ssh-add` once so the key is in the keychain.

**Linux.** Find the path to ssh with `which ssh`. Then save this as
`~/.config/systemd/user/zen-bridge-tunnel.service`, replacing the ssh path if needed:

```ini
[Unit]
Description=SSH tunnel for the Zen Tab Search MCP bridge
After=network-online.target
Wants=network-online.target

[Service]
ExecStart=/usr/bin/ssh -N zen-bridge
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
```

Enable it with `systemctl --user daemon-reload` and then `systemctl --user enable --now zen-bridge-tunnel.service`.
Run `loginctl enable-linger $USER` once if the tunnel should start at boot, before anyone logs in.
systemd can't answer a passphrase prompt, so the key must work without one, or be loaded into an
ssh-agent that the service can reach.

### 3. Register the server on the remote machine

On the server, follow [Register the server with your MCP client](#3-register-the-server-with-your-mcp-client)
with the token from your computer and the server's own path to `zen-tab-search-mcp.mjs`. The
client on the server starts the server itself, and the server connects to the bridge through the
tunnel. You don't run the server on your computer.

### 4. Check the connection

With the tunnel up and Zen open, ask the agent on the server to call `zen_status`. It should
report `"connected": true`. The server's own bridge listens on its loopback port, so `bridge: listening`
is normal. If it reports `"has not connected"`, check the tunnel first: the ssh session should be
running, and the port is free on your computer. Then check the token in the server's client
config.

Keep the token on the server private. Anyone who can log in to the server can reach the bridge
port and must still have the token to drive Zen. Only use the tunnel on a server you trust.

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
| `zen_create_space`            | Create a space without switching to it, or reuse the one with that name                   |
| `zen_rename_space`            | Rename a space                                                                            |
| `zen_delete_space`            | Delete spaces and the tabs in them (essentials kept); cannot delete the last space        |
| `zen_rename_tab`              | Set a tab's custom name; an empty name clears it                                          |
| `zen_create_folder`           | Create a folder (nested with `parentId`), or reuse the one with that name in that place   |
| `zen_rename_folder`           | Rename a folder                                                                           |
| `zen_move_folder`             | Move a folder to another space and/or parent; omit `parentId` for the space root          |
| `zen_delete_folder`           | Delete empty folders (`folderIds`); nested empties are removed innermost first            |
| `zen_move_tabs_to_folder`     | Move tabs into a folder (and into the folder's space)                                     |
| `zen_remove_tabs_from_folder` | Take tabs out of their folder; they stay in the same space                                |
| `zen_move_tabs_to_space`      | Move tabs to another space without switching to it                                        |
| `zen_move_tab`                | Place a tab directly before or after another tab in the same space                        |
| `zen_set_essential`           | Mark tabs as essential (`tabIds`)                                                         |
| `zen_clear_essential`         | Remove tabs from Essentials so they can be moved                                          |
| `zen_close_tab`               | Close tabs (`tabIds`)                                                                     |
| `zen_apply_patch`             | Apply a PATCH-style tree of spaces, folders and tabs; `dryRun` returns the plan           |
| `zen_list_timers`             | Running tab timers with the tab, its label and when it ends                               |
| `zen_set_timer`               | Set the same timer on tabs (`tabIds` + `when`, such as `45m`)                             |
| `zen_clear_timer`             | Remove timers from tabs                                                                   |
| `zen_list_todos`              | Tabs marked as todo, with title, URL and where they sit                                   |
| `zen_set_todo`                | Mark tabs as todo                                                                         |
| `zen_clear_todo`              | Mark tabs' todos as done, which removes them                                              |
| `zen_list_colors`             | Tabs with a traffic-light color, with title, URL and where they sit                       |
| `zen_set_color`               | Set the same color on tabs (`tabIds` + `color`: red, orange or green)                     |
| `zen_clear_color`             | Clear traffic-light colors from tabs                                                      |
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
under `essentials`, marked `"global": true`, and in `full` mode have `"spaceId": null`. A tab
with a traffic-light color includes `"color": "red"` (or `orange` / `green`).

**Color tabs red, orange or green.** `zen_set_color` with `{ "tabIds": [118, 119], "color": "green" }`.
`zen_clear_color` removes it. `zen_list_colors` lists only the tabs that have a color.

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

**A nested layout in one call.** `zen_apply_patch` with a space whose children inherit its id:

```json
{
  "nodes": [
    {
      "type": "space",
      "name": "Client",
      "children": [
        {
          "type": "folder",
          "name": "Docs",
          "children": [
            { "type": "tab", "name": "Drive", "url": "https://drive.google.com/" }
          ]
        }
      ]
    }
  ]
}
```

Each node in the result is `created`, `patched`, `moved` or `failed`, with the resolved id.
`dryRun: true` returns that plan without changing Zen. Nested children do not need `spaceId`
or `folderId`. New tabs need a `url`. Patching an existing tab does not change its URL.

## Behaviour worth knowing

- **Folders hold pinned tabs.** That is Zen's model, so creating a folder with tabs, or opening
  or moving tabs into one, pins them.
- **New tabs open in the background** unless you pass `activate: true`. Their title stays
  "New Tab" until the page loads.
- **Repeating a call is safe** for space and folder creation, opening Google services, renaming,
  and moving tabs. `zen_open_tab` always opens a new tab. `zen_apply_patch` creates when a node
  has no `id`, so repeating a create-heavy tree will duplicate unless you pass the ids back.
- **Essential tabs cannot be moved** to a folder or another space until `zen_clear_essential`.
  After that, the existing move tools work; `zen_set_essential` last if you want them marked
  again.
- **Reordering stays within a space.** Move the tab to the target's space first.
- **Closing and deleting are explicit.** `zen_close_tab`, `zen_delete_folder`, and
  `zen_delete_space` take id arrays. Empty folders are deleted innermost first.
  Deleting a space closes the tabs in it (essentials are kept) and refuses to remove the last
  space. The tools still cannot navigate an existing tab or read page contents.
  `zen_apply_patch` does not delete.
- **One server owns the bridge.** Only one process can listen on port 47652. A server that starts
  takes the port over from one already running (for example from another Cursor window or MCP
  client). The older server then reports that it was taken over and stays passive, and it takes the
  port back once the newer server exits. Restart that client to use it again. A server only takes
  over with the token, and only from a build of the same bridge protocol. `ZEN_BRIDGE_PORT` changes the server's port for
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
| SSH: `bind [127.0.0.1]:47652: Address already in use` | Your computer already runs a server on port 47652. Quit the MCP client that started it, then start the tunnel again (see [Remote agents over SSH](#remote-agents-over-ssh)). |

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
