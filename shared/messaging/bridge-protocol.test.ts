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
      parseBridgeRequest({ id: "1", command: { type: "setTodo", tabIds: [4], status: "todo" } })
        ?.command,
    ).toEqual({ type: "setTodo", tabIds: [4], status: "todo" });
    expect(
      parseBridgeRequest({ id: "1", command: { type: "clearTodo", tabIds: [4] } })?.command,
    ).toEqual({ type: "clearTodo", tabIds: [4] });
  });

  it("rejects any status but todo, since done means cleared", () => {
    for (const status of ["none", "done"]) {
      expect(
        parseBridgeRequest({ id: "1", command: { type: "setTodo", tabIds: [4], status } }),
      ).toBeUndefined();
    }
  });
});

describe("status color commands", () => {
  it("accepts list, set and clear", () => {
    expect(parseBridgeRequest({ id: "1", command: { type: "listStatuses" } })?.command).toEqual({
      type: "listStatuses",
    });
    expect(
      parseBridgeRequest({
        id: "1",
        command: { type: "setStatus", tabIds: [4], light: "red" },
      })?.command,
    ).toEqual({ type: "setStatus", tabIds: [4], light: "red" });
    expect(
      parseBridgeRequest({ id: "1", command: { type: "clearStatus", tabIds: [4] } })?.command,
    ).toEqual({ type: "clearStatus", tabIds: [4] });
  });

  it("rejects a color that is not red, orange or green, including none", () => {
    for (const light of ["none", "blue", "yellow"]) {
      expect(
        parseBridgeRequest({ id: "1", command: { type: "setStatus", tabIds: [4], light } }),
      ).toBeUndefined();
    }
  });
});

describe("layout commands", () => {
  it("accepts createSpace, nested createFolder, essentials and closeTab", () => {
    expect(
      parseBridgeRequest({ id: "1", command: { type: "createSpace", name: "  Work  " } })?.command,
    ).toEqual({ type: "createSpace", name: "Work" });
    expect(
      parseBridgeRequest({
        id: "1",
        command: { type: "createFolder", name: "Nested", spaceId: "s1", parentId: "f1" },
      })?.command,
    ).toMatchObject({ type: "createFolder", name: "Nested", parentId: "f1" });
    expect(
      parseBridgeRequest({ id: "1", command: { type: "setEssential", tabIds: [3, 4] } })?.command,
    ).toEqual({ type: "setEssential", tabIds: [3, 4] });
    expect(
      parseBridgeRequest({ id: "1", command: { type: "closeTab", tabIds: [3] } })?.command,
    ).toEqual({ type: "closeTab", tabIds: [3] });
    expect(
      parseBridgeRequest({ id: "1", command: { type: "deleteSpace", spaceIds: ["s1", "s2"] } })
        ?.command,
    ).toEqual({ type: "deleteSpace", spaceIds: ["s1", "s2"] });
  });

  it("rejects a blank space name", () => {
    expect(
      parseBridgeRequest({ id: "1", command: { type: "createSpace", name: "   " } }),
    ).toBeUndefined();
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
