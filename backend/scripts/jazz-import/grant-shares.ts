import type { ShareGrant } from './shares.js';
import { type SessionTarget, visibleFolderIds } from './write-lists.js';

export interface SharedIn {
  recipientUserId: string;
  granted: number;
  visible: number;
}

async function grantOne(target: SessionTarget, groupId: string, grant: ShareGrant): Promise<void> {
  const token = await target.signJWT(grant.ownerUserId);
  const res = await fetch(`${target.syncBase}/groups/${encodeURIComponent(groupId)}/members`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ account: grant.recipientUserId, role: grant.role }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `grant folder ${grant.folderId} owner ${grant.ownerUserId} recipient ${grant.recipientUserId} role ${grant.role} failed: ${res.status} ${body}`,
    );
  }
}

// Grants each share as its owner, as rowboat's invite accept does, then counts from a fresh
// replica per recipient how many granted folders that recipient now pulls.
export async function grantShares(
  target: SessionTarget,
  grants: ShareGrant[],
  groups: Map<string, string>,
): Promise<SharedIn[]> {
  const byRecipient = new Map<string, Set<string>>();
  for (const grant of grants) {
    const groupId = groups.get(grant.folderId);
    if (groupId === undefined) throw new Error(`folder ${grant.folderId} has no minted group`);
    await grantOne(target, groupId, grant);
    const folderIds = byRecipient.get(grant.recipientUserId) ?? new Set<string>();
    folderIds.add(grant.folderId);
    byRecipient.set(grant.recipientUserId, folderIds);
  }

  const results: SharedIn[] = [];
  for (const [recipientUserId, folderIds] of byRecipient) {
    const visible = await visibleFolderIds(target, recipientUserId);
    results.push({
      recipientUserId,
      granted: folderIds.size,
      visible: [...folderIds].filter((id) => visible.has(id)).length,
    });
  }
  return results;
}
