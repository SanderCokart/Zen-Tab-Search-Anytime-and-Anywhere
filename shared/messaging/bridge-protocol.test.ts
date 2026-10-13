import { describe, expect, it } from "vitest";
import {
  BRIDGE_PROTOCOL_VERSION,
  parseBridgeHello,
  parseBridgeRequest,
} from "@/shared/messaging/bridge-protocol";

describe("parseBridgeRequest", () => {
  it("accepts a valid command", () => {
    expect(
      parseBridgeRequest({
        id: "1",
        command: { type: "moveTabsToFolder", tabIds: [3, 4], folderId: "f1" },
      }),
    ).toEqual({ id: "1", command: { type: "moveTabsToFolder", tabIds: [3, 4], folderId: "f1" } });
  });

  it("trims folder names and rejects blank ones", () => {
    expect(
      parseBridgeRequest({ id: "1", command: { type: "createFolder", name: "  Work  " } })?.command,
    ).toEqual({ type: "createFolder", name: "Work" });
    expect(
      parseBridgeRequest({ id: "1", command: { type: "createFolder", name: "   " } }),
    ).toBeUndefined();
  });

  it("rejects unknown commands, bad tab IDs and empty tab lists", () => {
    expect(parseBridgeRequest({ id: "1", command: { type: "closeAllTabs" } })).toBeUndefined();
    expect(
      parseBridgeRequest({ id: "1", command: { type: "activateTab", tabId: -1 } }),
    ).toBeUndefined();
    expect(
      parseBridgeRequest({ id: "1", command: { type: "removeTabsFromFolder", tabIds: [] } }),
    ).toBeUndefined();
    expect(parseBridgeRequest({ command: { type: "listSpaces" } })).toBeUndefined();
  });
});

describe("parseBridgeHello", () => {
  it("returns the token for the current protocol version only", () => {
    expect(
      parseBridgeHello({ type: "hello", token: "t", protocolVersion: BRIDGE_PROTOCOL_VERSION }),
    ).toEqual({ token: "t" });
    expect(parseBridgeHello({ type: "hello", token: "t", protocolVersion: 99 })).toBeUndefined();
  });
});

describe("todo commands", () => {
  it("accepts list, set and clear", () => {
    expect(parseBridgeRequest({ id: "1", command: { type: "listTodos" } })?.command).toEqual({
      type: "listTodos",
    });
    expect(
      parseBridgeRequest({ id: "1", command: { type: "setTodo", tabId: 4, status: "todo" } })
        ?.command,
    ).toEqual({ type: "setTodo", tabId: 4, status: "todo" });
    expect(
      parseBridgeRequest({ id: "1", command: { type: "clearTodo", tabId: 4 } })?.command,
    ).toEqual({ type: "clearTodo", tabId: 4 });
  });

  it("rejects any status but todo, since done means cleared", () => {
    for (const status of ["none", "done"]) {
      expect(
        parseBridgeRequest({ id: "1", command: { type: "setTodo", tabId: 4, status } }),
      ).toBeUndefined();
    }
  });
});

describe("openTab command", () => {
  it("accepts web URLs with defaults for active and pinned", () => {
    expect(
      parseBridgeRequest({
        id: "1",
        command: { type: "openTab", url: " https://drive.google.com/ " },
      })?.command,
    ).toEqual({ type: "openTab", url: "https://drive.google.com/", active: false, pinned: false });
  });

  it("rejects anything that is not an http or https URL", () => {
    for (const url of [
      "javascript:alert(1)",
      "file:///C:/secret.txt",
      "about:config",
      "not a url",
    ]) {
      expect(parseBridgeRequest({ id: "1", command: { type: "openTab", url } })).toBeUndefined();
    }
  });
});
