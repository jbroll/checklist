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

async function getJson(url: string): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: 'GET',
    credentials: 'include',
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error((data.error as string) || `Request failed: ${res.status}`);
  return data;
}

/** Fetch the backend agent account id. Returns null when no agent is configured. */
async function getMergeAgentAccountId(): Promise<string | null> {
  const data = await getJson('/api/account/merge/agent');
  return (data.agentAccountId as string | null) ?? null;
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

type JazzGroup = {
  members: Array<{ id: string }>;
  addMember: (account: unknown, role: string) => void;
  removeMember: (account: unknown) => void;
  $jazz: { waitForSync: () => Promise<void>; loadedAs: never };
};
type JazzFolder = { archived?: boolean; $jazz: { id: string; owner: JazzGroup } };
type JazzAccount = { root: { folders: JazzFolder[] } };

/**
 * Grant the backend sharing agent admin on each group-owned top-level folder,
 * then return the folder ids. The backend's /prepare endpoint will use the agent
 * (server-side) to grant the TARGET account admin on each of those same folders —
 * mirroring the proven createInviteAndGrantAgent share flow exactly.
 *
 * Account-owned folders (the default "Quick Errands" etc.) are detected by the
 * absence of a `members` array on the owner and are silently skipped. They cannot
 * be shared anyway and the target already has its own default folder.
 */
export async function shareTopLevelFoldersTo(
  account: JazzAccount,
  _targetJazzId: string,
): Promise<string[]> {
  const ids: string[] = [];

  // Step 1: get the backend agent account id. Without it we cannot grant the
  // agent admin, so return an empty list (backend prepare will be a no-op).
  const agentAccountId = await getMergeAgentAccountId();
  if (!agentAccountId) {
    return ids;
  }

  // Step 2: ensure the folder list is loaded (not just refs).
  await (
    account as unknown as { $jazz: { ensureLoaded: (opts: unknown) => Promise<unknown> } }
  ).$jazz.ensureLoaded({
    resolve: { root: { folders: { $each: true } } },
  });
  const topFolders = account.root?.folders ?? [];

  for (const ref of topFolders) {
    if (!ref || ref.archived) {
      continue;
    }

    // Step 3: re-load the folder fresh so its owner Group's `members` list is
    // fully usable — the same pattern agent.ts uses server-side.
    const folder = await FolderNode.load(ref.$jazz.id, { loadAs: account as never });
    if (!folder) {
      continue;
    }

    const group = (folder as unknown as JazzFolder)?.$jazz?.owner;
    if (!group) {
      continue;
    }

    // Step 4: detect account-owned folders. Group-owned folders have a `members`
    // array; account-owned ones do not (the "owner" is the Account itself which
    // has no `members` property). Skip them — they cannot be shared.
    if (!Array.isArray(group.members)) {
      continue;
    }

    // Step 5: grant the agent admin on this folder's group (idempotent).
    // This mirrors createInviteAndGrantAgent exactly.
    try {
      const alreadyAgent = group.members.some((m: { id: string }) => m.id === agentAccountId);
      if (!alreadyAgent) {
        const agentAccount = await Account.load(agentAccountId as never, {
          loadAs: group.$jazz.loadedAs as never,
        });
        if (!agentAccount) {
          continue;
        }
        group.addMember(agentAccount, 'admin');
        await group.$jazz.waitForSync();
      }
      ids.push(ref.$jazz.id);
    } catch {
      // Non-fatal: skip. The backend will also skip this folder.
    }
  }

  return ids;
}

export async function adoptFolders(
  account: JazzAccount & {
    root: {
      folders: {
        $jazz: { push: (f: unknown) => void; waitForSync?: () => Promise<void> };
      } & JazzFolder[];
    };
  },
  folderIds: string[],
  sourceJazzId: string,
): Promise<void> {
  for (const id of folderIds) {
    if (account.root.folders.some((f) => f?.$jazz?.id === id)) continue; // idempotent
    // The folder was just shared to us by the source; the group-membership grant
    // may still be propagating from the sync server. Retry the load a few times
    // so a transient sync lag doesn't silently drop an adopted folder.
    let folder = await FolderNode.load(id, { loadAs: account as never });
    for (let attempt = 0; !folder && attempt < 10; attempt++) {
      await new Promise((r) => setTimeout(r, 1000));
      folder = await FolderNode.load(id, { loadAs: account as never });
    }
    if (!folder) continue;
    account.root.folders.$jazz.push(folder);
    // Best-effort: drop the now-detached source identity from the group.
    try {
      const group = (folder as unknown as JazzFolder).$jazz.owner;
      const sourceAccount = await Account.load(sourceJazzId as never, {
        loadAs: group.$jazz.loadedAs as never,
      });
      if (sourceAccount) group.removeMember(sourceAccount as never);
    } catch {
      /* non-fatal: ghost admin is a dead, unloggable account */
    }
  }
  // Flush the updated root to the sync server so a subsequent home load (which
  // re-fetches from the server after this account's re-login) sees the adopted
  // folders instead of a stale cached list.
  try {
    await account.root.folders.$jazz.waitForSync?.();
  } catch {
    /* best-effort: sync will still converge eventually */
  }
}
