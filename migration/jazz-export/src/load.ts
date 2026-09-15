import type { Account } from 'jazz-tools';
import type { ExportFolder, ExportUser, ExportViewState } from './format.js';
import { FolderNode, ListsRoot } from './schema.js';
import { type LoadedFolder, type LoadedSettings, serializeFolder, serializeSettings, serializeViewState } from './serialize.js';

// biome-ignore lint/suspicious/noExplicitAny: FolderNode is an untyped recursive schema
type AnyCoList = any;

function refIds(list: AnyCoList): string[] {
  if (!list) return [];
  return Array.from(list.$jazz.refs as Iterable<{ id: string }>, (ref) => ref.id);
}

export async function loadTree(account: Account, userId: string): Promise<ExportUser> {
  const rootId: string | null | undefined = account.$jazz.raw.get('root');
  if (!rootId) throw new Error('account has no root');

  const root = await ListsRoot.load(rootId, {
    loadAs: account,
    resolve: { folders: { $each: true }, viewState: true, userSettings: true },
  });
  if (!root || !root.$isLoaded) throw new Error(`root ${rootId} failed to load`);

  const rootFolderIds = refIds(root.folders);
  const folders: ExportFolder[] = [];
  const visited = new Set<string>();

  async function walk(id: string, parentId: string | null): Promise<void> {
    if (visited.has(id)) return;
    visited.add(id);

    const node = await FolderNode.load(id, { loadAs: account, resolve: { children: { $each: true } } });
    if (!node || !node.$isLoaded) throw new Error(`folder ${id} failed to load`);

    const ownerAccountId: string | undefined = node.$jazz.refs.owner?.id;
    if (!ownerAccountId) throw new Error(`folder ${id} has no owner ref`);
    const groupId: string = node.$jazz.owner.$jazz.id;
    const childIds = refIds(node.children);

    folders.push(serializeFolder({ ...(node as LoadedFolder), id }, parentId, childIds, ownerAccountId, groupId));
    for (const childId of childIds) await walk(childId, id);
  }

  for (const id of rootFolderIds) await walk(id, null);

  return {
    userId,
    accountId: account.$jazz.id,
    rootFolderIds,
    folders,
    userSettings: serializeSettings(root.userSettings ? (root.userSettings as LoadedSettings) : null),
    viewState: serializeViewState(root.viewState ? (root.viewState as ExportViewState) : null),
  };
}
