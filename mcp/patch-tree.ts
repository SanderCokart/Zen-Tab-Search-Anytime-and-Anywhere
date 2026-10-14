import * as v from "valibot";
import {
  tabSummarySchema,
  type BridgeCommand,
  type TabSummary,
  type ZenFolderInfo,
} from "@/shared/messaging/bridge-protocol";
import type { SpaceInfo } from "@/shared/messaging/protocol";

export type TabPatchNode = {
  type: "tab";
  id?: number;
  name?: string;
  url?: string;
  spaceId?: string;
  folderId?: string;
  essential?: boolean;
};

export type FolderPatchNode = {
  type: "folder";
  id?: string;
  name?: string;
  spaceId?: string;
  folderId?: string;
  children?: Array<TabPatchNode | FolderPatchNode>;
};

export type SpacePatchNode = {
  type: "space";
  id?: string;
  name?: string;
  children?: Array<TabPatchNode | FolderPatchNode>;
};

export type PatchTreeNode = SpacePatchNode | TabPatchNode | FolderPatchNode;

export type PatchNodeStatus = "created" | "patched" | "moved" | "failed";

export type PatchNodeResult = {
  path: string;
  type: "space" | "folder" | "tab";
  status: PatchNodeStatus;
  id?: string | number;
  name?: string;
  error?: string;
};

export type PatchSnapshot = {
  spaces: Pick<SpaceInfo, "id" | "name">[];
  folders: ZenFolderInfo[];
  tabs: Pick<TabSummary, "id" | "title" | "customLabel" | "spaceId" | "folderId" | "essential">[];
};

export type PatchRequest = (command: BridgeCommand) => Promise<unknown>;

type WorkNode = {
  path: string;
  type: "space" | "folder" | "tab";
  inputId?: string | number;
  name?: string;
  url?: string;
  essential?: boolean;
  /** Desired space; set from nesting or an explicit detached location. */
  spaceId?: string;
  /** Desired parent folder. `null` is the space root; omitted means "do not move". */
  folderId?: string | null;
  parent?: WorkNode;
  children: WorkNode[];
  resolvedId?: string | number;
  status?: PatchNodeStatus;
  error?: string;
  didMove?: boolean;
};

function isWebUrl(url: string): boolean {
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function inheritedParentFolder(
  inherited: { parent?: WorkNode },
  explicitFolderId?: string,
  spaceId?: string,
): string | null | undefined {
  if (explicitFolderId !== undefined) {
    return explicitFolderId;
  }
  if (inherited.parent?.type === "space") {
    return null;
  }
  if (inherited.parent?.type === "folder") {
    return typeof inherited.parent.inputId === "string" ? inherited.parent.inputId : undefined;
  }
  if (spaceId) {
    return null;
  }
  return undefined;
}

function walk(
  nodes: PatchTreeNode[],
  inherited: { spaceId?: string; parent?: WorkNode },
  prefix: string,
): WorkNode[] {
  return nodes.map((node, index) => {
    const path = prefix === "" ? String(index) : `${prefix}.${index}`;
    if (node.type === "space") {
      const current: WorkNode = {
        path,
        type: "space",
        inputId: node.id,
        name: node.name,
        spaceId: node.id,
        children: [],
      };
      current.children = walk(node.children ?? [], { spaceId: node.id, parent: current }, path);
      return current;
    }
    if (node.type === "folder") {
      const spaceId = node.spaceId ?? inherited.spaceId;
      const current: WorkNode = {
        path,
        type: "folder",
        inputId: node.id,
        name: node.name,
        spaceId,
        folderId: inheritedParentFolder(inherited, node.folderId, spaceId),
        parent: inherited.parent,
        children: [],
      };
      current.children = walk(node.children ?? [], { spaceId, parent: current }, path);
      return current;
    }
    const spaceId = node.spaceId ?? inherited.spaceId;
    return {
      path,
      type: "tab",
      inputId: node.id,
      name: node.name,
      url: node.url,
      essential: node.essential,
      spaceId,
      folderId: inheritedParentFolder(inherited, node.folderId, spaceId),
      parent: inherited.parent,
      children: [],
    };
  });
}

function flatten(nodes: WorkNode[]): WorkNode[] {
  return nodes.flatMap((node) => [node, ...flatten(node.children)]);
}

function resolveSpaceId(node: WorkNode): string | undefined {
  if (node.type === "space") {
    return typeof node.resolvedId === "string" ? node.resolvedId : node.spaceId;
  }
  if (node.spaceId) {
    return node.spaceId;
  }
  for (let current = node.parent; current; current = current.parent) {
    if (current.type === "space" && typeof current.resolvedId === "string") {
      return current.resolvedId;
    }
    if (current.spaceId) {
      return current.spaceId;
    }
  }
  return undefined;
}

function resolveFolderId(node: WorkNode): string | null | undefined {
  if (node.type === "space") {
    return undefined;
  }
  if (node.folderId !== undefined) {
    return node.folderId;
  }
  for (let current = node.parent; current; current = current.parent) {
    if (current.type === "folder") {
      return typeof current.resolvedId === "string" ? current.resolvedId : undefined;
    }
    if (current.type === "space") {
      return null;
    }
  }
  return undefined;
}

function ancestorIsNew(node: WorkNode): boolean {
  for (let current = node.parent; current; current = current.parent) {
    if (current.inputId === undefined) {
      return true;
    }
  }
  return false;
}

function fail(node: WorkNode, error: string): void {
  node.status = "failed";
  node.error = error;
  for (const child of flatten(node.children)) {
    if (!child.status) {
      child.status = "failed";
      child.error = `Parent at ${node.path} failed.`;
    }
  }
}

function resultOf(node: WorkNode): PatchNodeResult {
  return {
    path: node.path,
    type: node.type,
    status: node.status ?? "patched",
    ...(node.resolvedId !== undefined ? { id: node.resolvedId } : {}),
    ...(node.name !== undefined ? { name: node.name } : {}),
    ...(node.error ? { error: node.error } : {}),
  };
}

function willMoveTab(node: WorkNode, current: PatchSnapshot["tabs"][number] | undefined): boolean {
  if (node.type !== "tab" || node.inputId === undefined) {
    return false;
  }
  if (ancestorIsNew(node)) {
    return true;
  }
  if (!current) {
    return false;
  }
  const spaceId = resolveSpaceId(node);
  const folderId = resolveFolderId(node);
  if (spaceId && current.spaceId !== spaceId) {
    return true;
  }
  if (folderId !== undefined && (current.folderId ?? null) !== folderId) {
    return true;
  }
  return false;
}

function willMoveFolder(node: WorkNode, current: ZenFolderInfo | undefined): boolean {
  if (node.type !== "folder" || typeof node.inputId !== "string") {
    return false;
  }
  if (ancestorIsNew(node)) {
    return true;
  }
  if (!current) {
    return false;
  }
  const spaceId = resolveSpaceId(node);
  const folderId = resolveFolderId(node);
  if (spaceId && current.spaceId !== spaceId) {
    return true;
  }
  if (folderId !== undefined && (current.parentId ?? null) !== folderId) {
    return true;
  }
  return false;
}

async function moveTabToLocation(node: WorkNode, request: PatchRequest): Promise<void> {
  const tabId = node.resolvedId;
  if (typeof tabId !== "number") {
    return;
  }
  const folderId = resolveFolderId(node);
  const spaceId = resolveSpaceId(node);
  if (folderId) {
    await request({ type: "moveTabsToFolder", tabIds: [tabId], folderId });
    return;
  }
  if (folderId === null) {
    await request({ type: "removeTabsFromFolder", tabIds: [tabId] });
  }
  if (spaceId) {
    await request({ type: "moveTabsToSpace", tabIds: [tabId], spaceId });
  }
}

/**
 * Walk a PATCH-style tree: nested children inherit space/folder, `id` patches,
 * missing `id` creates. Does not delete. `dryRun` returns the same per-node
 * results without calling the bridge.
 */
export async function applyPatchTree(
  nodes: PatchTreeNode[],
  options: { dryRun?: boolean; snapshot: PatchSnapshot; request: PatchRequest },
): Promise<{ dryRun: boolean; results: PatchNodeResult[] }> {
  const dryRun = options.dryRun === true;
  const { snapshot, request } = options;
  const tree = walk(nodes, {}, "");
  const all = flatten(tree);

  for (const node of all) {
    if (node.status === "failed") {
      continue;
    }
    if (node.inputId === undefined) {
      if (!node.name?.trim()) {
        fail(
          node,
          node.type === "tab"
            ? "Creating a tab requires a name."
            : `Creating a ${node.type} requires a name.`,
        );
        continue;
      }
      if (node.type === "tab" && (!node.url || !isWebUrl(node.url))) {
        fail(node, "New tabs need a url (http or https).");
        continue;
      }
      if (node.type !== "space" && !resolveSpaceId(node) && !node.parent) {
        fail(node, `Creating a ${node.type} at the root requires spaceId.`);
        continue;
      }
      continue;
    }
    if (node.type === "space") {
      if (!snapshot.spaces.some((space) => space.id === node.inputId)) {
        fail(node, `Space not found: ${String(node.inputId)}.`);
      }
    } else if (node.type === "folder") {
      if (!snapshot.folders.some((folder) => folder.id === node.inputId)) {
        fail(node, `Folder not found: ${String(node.inputId)}.`);
      }
    } else if (!snapshot.tabs.some((tab) => tab.id === node.inputId)) {
      fail(node, `Tab not found: ${String(node.inputId)}.`);
    }
  }

  const live = () => all.filter((node) => node.status !== "failed");

  // 1. Clear essential on tabs that will move, or that the patch unmarks.
  for (const node of live()) {
    if (node.type !== "tab" || typeof node.inputId !== "number") {
      continue;
    }
    const current = snapshot.tabs.find((tab) => tab.id === node.inputId);
    const moving = willMoveTab(node, current);
    if (current?.essential && (moving || node.essential === false) && !dryRun) {
      await request({ type: "clearEssential", tabIds: [node.inputId] });
    }
  }

  // 2. Create / rename spaces.
  for (const node of live()) {
    if (node.type !== "space") {
      continue;
    }
    try {
      if (node.inputId === undefined) {
        node.status = "created";
        if (dryRun) {
          continue;
        }
        const created = v.parse(
          v.object({ spaceId: v.string() }),
          await request({ type: "createSpace", name: node.name! }),
        );
        node.resolvedId = created.spaceId;
        node.spaceId = created.spaceId;
      } else {
        node.resolvedId = node.inputId;
        node.status = "patched";
        if (node.name && !dryRun) {
          await request({
            type: "renameSpace",
            spaceId: String(node.inputId),
            name: node.name,
          });
        }
      }
    } catch (error) {
      fail(node, error instanceof Error ? error.message : String(error));
    }
  }

  // 3. Create / rename / reparent folders, parents before children (pre-order).
  for (const node of live()) {
    if (node.type !== "folder") {
      continue;
    }
    try {
      const spaceId = resolveSpaceId(node);
      const parentId = resolveFolderId(node);
      if (node.inputId === undefined) {
        node.status = "created";
        if (dryRun) {
          continue;
        }
        if (!spaceId) {
          fail(node, "Creating a folder requires a space.");
          continue;
        }
        const created = v.parse(
          v.object({ folderId: v.string() }),
          await request({
            type: "createFolder",
            name: node.name!,
            spaceId,
            ...(parentId ? { parentId } : {}),
          }),
        );
        node.resolvedId = created.folderId;
      } else {
        const current = snapshot.folders.find((folder) => folder.id === node.inputId);
        const moving = willMoveFolder(node, current);
        node.resolvedId = node.inputId;
        node.status = moving ? "moved" : "patched";
        node.didMove = moving;
        if (dryRun) {
          continue;
        }
        if (node.name) {
          await request({
            type: "renameFolder",
            folderId: String(node.inputId),
            name: node.name,
          });
        }
        if (moving && spaceId) {
          await request({
            type: "moveFolder",
            folderId: String(node.inputId),
            spaceId,
            ...(parentId ? { parentId } : {}),
          });
        }
      }
    } catch (error) {
      fail(node, error instanceof Error ? error.message : String(error));
    }
  }

  // 4. Open / move / rename tabs.
  for (const node of live()) {
    if (node.type !== "tab") {
      continue;
    }
    try {
      const spaceId = resolveSpaceId(node);
      const folderId = resolveFolderId(node);
      if (node.inputId === undefined) {
        node.status = "created";
        if (dryRun) {
          continue;
        }
        if (!spaceId) {
          fail(node, "Creating a tab requires a space.");
          continue;
        }
        const opened = v.parse(
          tabSummarySchema,
          await request({
            type: "openTab",
            url: node.url!,
            spaceId,
            ...(folderId ? { folderId } : {}),
            active: false,
            pinned: false,
          }),
        );
        node.resolvedId = opened.id;
        if (node.name) {
          await request({ type: "renameTab", tabId: opened.id, label: node.name });
        }
      } else {
        const current = snapshot.tabs.find((tab) => tab.id === node.inputId);
        const moving = willMoveTab(node, current);
        node.resolvedId = node.inputId;
        node.status = moving ? "moved" : "patched";
        node.didMove = moving;
        if (dryRun) {
          continue;
        }
        if (node.name !== undefined) {
          await request({ type: "renameTab", tabId: Number(node.inputId), label: node.name });
        }
        if (moving) {
          await moveTabToLocation(node, request);
        }
      }
    } catch (error) {
      fail(node, error instanceof Error ? error.message : String(error));
    }
  }

  // 5. Set essential last, after every move.
  for (const node of live()) {
    if (node.type !== "tab" || node.essential !== true || typeof node.resolvedId !== "number") {
      continue;
    }
    if (dryRun) {
      continue;
    }
    try {
      await request({ type: "setEssential", tabIds: [node.resolvedId] });
    } catch (error) {
      fail(node, error instanceof Error ? error.message : String(error));
    }
  }

  // 6. Sibling order is the desired order of `children`.
  if (!dryRun) {
    const groups = [tree, ...all.map((node) => node.children)];
    for (const siblings of groups) {
      const placed = siblings.filter(
        (node) => node.status !== "failed" && node.resolvedId !== undefined,
      );
      for (let index = 1; index < placed.length; index++) {
        const previous = placed[index - 1]!;
        const current = placed[index]!;
        try {
          if (current.type === "tab" && previous.type === "tab") {
            await request({
              type: "moveTabAfter",
              tabId: Number(current.resolvedId),
              targetTabId: Number(previous.resolvedId),
            });
          } else if (current.type === "folder" && previous.type === "folder") {
            const spaceId = resolveSpaceId(current);
            const parentId = resolveFolderId(current);
            if (spaceId) {
              await request({
                type: "moveFolder",
                folderId: String(current.resolvedId),
                spaceId,
                ...(parentId ? { parentId } : {}),
                afterFolderId: String(previous.resolvedId),
              });
            }
          }
        } catch {
          // Ordering is best-effort; the node already exists at the right place.
        }
      }
    }
  }

  return { dryRun, results: all.map(resultOf) };
}
