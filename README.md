# Zen Tab Search Anytime and Anywhere

Find any tab, switch spaces, add context, and stay focused in Zen Browser.

Zen Tab Search is a fast fuzzy search overlay and popup for tabs, spaces, and custom labels. It is exclusive to [Zen Browser](https://zen-browser.app/).

## Features

### Search any tab and custom labels across spaces

Search tab titles, URLs, and custom labels from one place, including tabs in another Zen space. Results update as you type, and keyboard navigation lets you activate a tab without leaving the current page.

Spaces and essential tabs sit in their own tile grids above the tab list. They stay above the current tab and above folder groups, including while you search.

![Search results across tabs and spaces, with spaces and essential tabs shown in grids above the list](docs/gifs/search-tabs-and-spaces-omnibar.gif)

### Search features on both surfaces

The omnibar and toolbar popup support the same tab-search features. Essential tabs appear as tiles, and you can name them even though Zen has no writable label for them. Search matches both an assigned name and the original page title.

**Group tabs by folders** turns each Zen folder into its own section. **Group by subfolders** nests those sections inside the parent folder. Both are in Display options.

From search, the clock on a result opens timer controls, and **Timer** in the result menu does the same. The clock beside the search field lists every running timer so you can jump to that tab or clear one or all of them.

| Feature | Omnibar | Toolbar popup |
| --- | --- | --- |
| Spaces and essential tabs | ![Spaces and essential tabs in the omnibar](docs/gifs/search-tabs-and-spaces-omnibar.gif) | ![Spaces and essential tabs in the toolbar popup](docs/gifs/search-tabs-and-spaces-popup.gif) |
| Hide spaces or essential tabs | ![Hiding grids in the omnibar](docs/gifs/hide-spaces-and-essentials-omnibar.gif) | ![Hiding grids in the toolbar popup](docs/gifs/hide-spaces-and-essentials-popup.gif) |
| Rename a tab from its result | ![Renaming a tab in the omnibar](docs/gifs/rename-tab-omnibar.gif) | ![Renaming a tab in the toolbar popup](docs/gifs/rename-tab-popup.gif) |
| Group results by folder | ![Folder groups in the omnibar](docs/gifs/folder-groups-omnibar.gif) | ![Folder groups in the toolbar popup](docs/gifs/folder-groups-popup.gif) |
| Timers from a result | ![Timers from an omnibar result](docs/gifs/timers-from-search-omnibar.gif) | ![Timers from a toolbar-popup result](docs/gifs/timers-from-search-popup.gif) |

### GitHub and GitLab issues beside your tabs

Open the omnibar to see GitHub and GitLab issues, pull requests, and merge requests beside the tab results, sorted by when you last opened them. Type `#` or `!` at the start of the query, or press Tab, to move the keyboard between the two lists.

With detection on, the omnibar is a wide 3:2 panel. With detection off, it is a square panel of tab results. **Show issues only in the issue navigator** keeps those tabs in the navigator and out of the tab list, and is available while detection is on.

![Wide omnibar with the issue navigator, followed by a square omnibar with issue detection disabled](docs/gifs/omnibar-shape.gif)

### Display options

Open them from the gear in either search surface.

- **Colors.** Text, and the background of issues, folders, and spaces. Each color has its own reset. The picker accepts HEX, HSL, and RGB. Text color applies to the omnibar and the toolbar popup.
- **Size.** Font size is the base everything else is derived from. Density scales padding, icons, and the space and essential-tab tiles. **Follow the page zoom level** lets the omnibar grow and shrink with the page; with it off, the omnibar keeps the same size on screen at every zoom level. The toolbar popup stays a compact fixed size.
- **Gaps.** Six sliders, in pixels at the default font size: between sections, tabs, folders, essential tabs, spaces, and issues. Each slider moves that one gap. Padding inside rows and tiles follows density.
- **Long titles.** Tab titles and issue titles can stay on one line or wrap. Section headers stay on one line either way.

| Option | Omnibar | Toolbar popup |
| --- | --- | --- |
| Colors | ![Choosing colors for the omnibar](docs/gifs/display-colors-omnibar.gif) | ![Choosing colors for the toolbar popup](docs/gifs/display-colors-popup.gif) |
| Size and density | ![Adjusting omnibar size and density](docs/gifs/display-size-omnibar.gif) | ![Adjusting toolbar-popup density](docs/gifs/display-size-popup.gif) |
| Gaps | ![Adjusting omnibar gaps](docs/gifs/display-gaps-omnibar.gif) | ![Adjusting toolbar-popup gaps](docs/gifs/display-gaps-popup.gif) |
| Long titles | ![Wrapping long titles in the omnibar](docs/gifs/display-truncation-omnibar.gif) | ![Wrapping long titles in the toolbar popup](docs/gifs/display-truncation-popup.gif) |

### Automatic GitLab and GitHub issue and MR/PR labels

On GitLab and GitHub issue, merge request, and pull request pages, press `Ctrl+Alt+R` to read the page URL and title and create a useful custom label automatically. For example:

- `ISSUE: #123 - Fix the search results`
- `MR: #123 - !45 - Improve tab search`
- `PR: #123 - !45 - Improve tab search`

On other pages, `Ctrl+Alt+R` opens Zen's native Change Label editor.

![Automatically creating GitLab and GitHub issue, merge request, and pull request labels](docs/gifs/automatic-forge-labels.gif)

## Keyboard shortcuts

Shortcuts use `Ctrl` on Windows/Linux and `⌘` on macOS. Change or assign extension shortcuts in `about:addons` → **Zen Tab Search** → **Manage Extension Shortcuts**.

- `Ctrl+Shift+F` — Open the in-page search overlay when a content tab is active
- `Ctrl+Alt+F` — Open the popup search UI; also works when no web page tab is active
- `Ctrl+Alt+T` — Open the timer for the current tab
- `Ctrl+Alt+R` — Change Zen label: auto-label GitLab/GitHub issues and MR/PRs, or open Zen's Change Label editor
- `Arrow keys` / `Page Up` / `Page Down` — Navigate results; use `Left` / `Right` with Page Up/Down for larger jumps
- `Enter` — Activate the selected result
- `Escape` — Close the search UI



## Installation



### From a GitHub release (recommended)

1. Download the latest `.zip` from the [Releases page](https://github.com/SanderCokart/Zen-Tab-Search-Anytime-and-Anywhere/releases).
2. Open `about:config` in Zen Browser.
3. Set these preferences to `true` and restart Zen:
  - `extensions.experiments.enabled`
  - `xpinstall.signatures.required`
4. Open `about:addons`, click the gear icon, and choose **Install Add-on From File…**.
5. Select the downloaded `.zip` (you can also drag it onto the page).



### Build from source

```bash
npm install
npm run zip
```

The zip will be produced by WXT. Install it using the same `about:addons` → gear → **Install Add-on From File…** flow above.

## At a glance

- Fuzzy search across tab titles, URLs, spaces, and Zen custom labels
- Spaces and essential tabs as grids above the list, with a chosen name for each essential tab
- Rename a tab from its result; search still matches the original title
- Folder and subfolder sections
- A toolbar popup that stays compact, and an omnibar whose size, density, and gaps you set
- Colors for text, issues, folders, and spaces
- Custom tab timers, including from a search result
- GitHub and GitLab issues beside tab results, in a wide omnibar or a square one
- Automatic custom labels for GitLab/GitHub issues, merge requests, and pull requests



## Important notices

- This extension is exclusive to Zen Browser and relies on Zen's internal workspace and tab APIs.
- It uses privileged `experiment_apis`, so it cannot be published on addons.mozilla.org (AMO) and must be installed from a zip file.
- The two `about:config` preferences above are required for Zen's extension APIs to be available.



## Credits and license

This project is based on [https://github.com/AntonDobrovinskiy/Zen-Tab-Search](https://github.com/AntonDobrovinskiy/Zen-Tab-Search), which is released under the MIT license. Anton Dobrovinskiy retains the copyright as per the MIT license.

This repository is a fork of that project with rewritten git history.

See [LICENSE](LICENSE) for the full MIT license text.

## Why this cannot be published on AMO

Mozilla intentionally blocks extensions that declare `experiment_apis` (privileged Experiment APIs) from being submitted to addons.mozilla.org, so this repository does not maintain an AMO signing flow. End users still need the two `about:config` changes for the Zen-specific APIs (`browser.zenTabs`) to be available.

The only supported distribution method for this extension is sideloading a zip (or XPI) as described above.

## Creating a release

Releases are published as GitHub release zips. The release script bumps the package version, commits the version files, tags the commit, builds the extension zip, creates a GitHub release, and attaches the zip.

```bash
npm run release -- patch --message "Maintenance release"
npm run release -- minor --notes-file ./RELEASE.md
npm run release -- patch --generate-notes
npm run release -- patch --dry-run --generate-notes
```

Use `patch`/`bump`, `minor`, `major`, or an exact `x.y.z` version. Release notes can be supplied with `--message`, loaded with `--notes-file`, or generated from commits since the latest tag with `--generate-notes`. The script requires a clean working tree and an authenticated GitHub CLI session (`gh auth login`) before it starts.

Release checklist:

1. Start from `main` with `git status` clean.
2. Confirm GitHub CLI auth with `gh auth status`.
3. Preview the release with `npm run release -- patch --dry-run --generate-notes`.
4. Run the release command, for example `npm run release -- patch --generate-notes`.
5. Confirm the GitHub release contains the `zen-tab-search-<version>-firefox.zip` asset.

If a release fails, follow the recovery instructions printed by the script before retrying.

## Development

**Using Cursor?** Run the `[/quick-start](.cursor/commands/quick-start.md)` command.

Otherwise:

```bash
npm install
npm run dev
```

While the dev server is running, WXT rebuilds and reloads the extension on file changes.

Load in Zen Browser:

1. Open `about:debugging`
2. Click **This Firefox**
3. **Load Temporary Add-on…**
4. Select `manifest.json` from `.output/firefox-mv2/`

Run quality checks:

```bash
npm run lint:js
npm run format
npm test
npm run lint:web-ext
```

Pre-commit hooks run through Husky and lint-staged. They format staged JSON, Markdown, and CSS files, run ESLint fixes for staged JavaScript/TypeScript files, and run the `web-ext` lint wrapper when extension files change. The wrapper allows the known privileged `experiment_apis` finding because this project is distributed as a sideload-only Zen Browser zip.

## Project structure

```
entrypoints/          WXT entry points (background, content script, popup, options)
app/                  Background wiring that spans features
features/             search, timers, forge, settings, zen
shared/               Wire protocol, types, logging, styles
public/experiment/    Privileged Experiment API (zenTabs) — required for cross-space Zen support
public/icon/          Extension icons
scripts/              Build and release helpers
docs/gifs/            Feature recordings used above
```



## License

MIT — see [LICENSE](LICENSE). The original author (Anton Dobrovinskiy) retains copyright as per the MIT terms.