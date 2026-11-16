# 16 November 2026

The omnibar changes from this session, in the order they landed. The commit is `d1263ce` on `feat/spec01-redesign`.

## The custom menu receives the click

Right-click on a tab was opening the Firefox content menu, and sometimes the Windows system menu (Restore, Move, Size, Close) on top of the custom menu. Mark as todo did not receive the click.

The omnibar browser now sets `disablecontextmenu`, and the overlay sets `-moz-window-dragging: no-drag`. A full extension reload, then Alt+F, rebuilds the overlay.

## Typing sounds and the clear control

Edit pinned URL and Rename use the same key-down and key-up sounds as the search field.

The Clear… control in the todo column uses the full control height, inside a header that can grow.

## The tab context menu

Top to bottom: Close tab, Rename, Move to folder, Edit pinned URL, Replace pinned URL with current, Mark as todo, a status row, Timer, Host overrides.

Status is a horizontal row of red, orange, and green dots, plus a forbidden icon for no status. That forbidden button uses the same plain background as an unselected color. Close, Rename, Move to folder, both pinned-URL actions, and Mark as todo have stroke icons.

## Background opacity

A dial in the Theme module runs from 0% to 100% in 5% steps. It sits under System / Light / Dark and the color pickers. Panel backgrounds fade so the page behind the overlay shows through. Text, keys, and the readout stay solid. The options page and the popup stay solid.

The stored default is 75%. A value already saved on the dial stays until it is moved.

## Collapse all and Expand all

Tabs and Issues and requests each get a header control. Todos do not.

The Tabs header matches Issues and requests: the title on the left, the control in the exact middle of the rule, and a figure on the right. Tabs show the total tab count. Issues and requests keep Recent · count.

The label reads Collapse all, and switches to Expand all once every group in that column is folded. The header's uppercase styling shows them in caps.

## Tab folders ease open and shut

Tab folders use the same height animation as the issue folders. The rows stay mounted and the panel eases between fully open and fully shut, including Collapse all and Expand all.

## The current tab stays put

A collapsed folder keeps only the current tab visible, in the folder where it lives. Every other tab in that folder stays hidden. The folder itself stays collapsed, including after Collapse all.

Expanding the folder shows the rest of its tabs again.
