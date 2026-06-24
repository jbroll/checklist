import type { Group } from 'jazz-tools';
import { Account } from '@/schema';
import { FolderNode } from '@/schema/tree';

const MERGE_KEY = 'checklist:merge';

export interface MergeState {
  nonce: string;
  targetJazzId: string;
  sourceJazzId?: string;
  adoptedFolderIds?: string[];
  phase: 'awaiting-source' | 'awaiting-target';
}

export function saveMergeState(s: MergeState): void {
  localStorage.setItem(MERGE_KEY, JSON.stringify(s));
}
export function loadMergeState(): MergeState | null {
  const raw = localStorage.getItem(MERGE_KEY);
  return raw ? (JSON.parse(raw) as MergeState) : null;
}
export function clearMergeState(): void {
  localStorage.removeItem(MERGE_KEY);
}

async function postJson(url: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
    body: JSON.stringify(body ?? {}),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error((data.error as string) || `Request failed: ${res.status}`);
  return data;
}

export async function startMerge(): Promise<{ nonce: string; targetJazzId: string }> {
  const d = await postJson('/api/account/merge/start', {});
  return { nonce: d.nonce as string, targetJazzId: d.targetJazzId as string };
}
export async function prepareMerge(nonce: string, adoptedFolderIds: string[]): Promise<void> {
  await postJson('/api/account/merge/prepare', { nonce, adoptedFolderIds });
}
export async function finalizeMerge(nonce: string): Promise<void> {
  await postJson('/api/account/merge/finalize', { nonce });
}

type JazzFolder = { archived?: boolean; $jazz: { id: string; owner: Group } };
type JazzAccount = { root: { folders: JazzFolder[] } };

export async function shareTopLevelFoldersTo(
  account: JazzAccount,
  targetJazzId: string,
): Promise<string[]> {
  const ids: string[] = [];
  for (const folder of account.root.folders) {
    if (!folder || folder.archived) continue;
    const group = folder.$jazz.owner;
    const alreadyMember = group.members.some((m: { id: string }) => m.id === targetJazzId);
    if (!alreadyMember) {
      const targetAccount = await Account.load(targetJazzId, { loadAs: group.$jazz.loadedAs });
      if (!targetAccount) throw new Error('Could not load the target account to share with.');
      group.addMember(targetAccount as never, 'admin');
      await group.$jazz.waitForSync();
    }
    ids.push(folder.$jazz.id);
  }
  return ids;
}

export async function adoptFolders(
  account: JazzAccount & { root: { folders: { push: (f: unknown) => void } & JazzFolder[] } },
  folderIds: string[],
  sourceJazzId: string,
): Promise<void> {
  for (const id of folderIds) {
    if (account.root.folders.some((f) => f?.$jazz?.id === id)) continue; // idempotent
    const folder = await FolderNode.load(id, { loadAs: account as never });
    if (!folder) continue;
    account.root.folders.push(folder);
    // Best-effort: drop the now-detached source identity from the group.
    try {
      const group = (folder as unknown as JazzFolder).$jazz.owner;
      const sourceAccount = await Account.load(sourceJazzId, { loadAs: group.$jazz.loadedAs });
      if (sourceAccount) group.removeMember(sourceAccount as never);
    } catch {
      /* non-fatal: ghost admin is a dead, unloggable account */
    }
  }
}
