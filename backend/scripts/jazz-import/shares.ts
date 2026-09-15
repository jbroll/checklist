import type { ExportUser } from '../../../migration/jazz-export/src/format.js';
import { planUser } from './map.js';

export interface ShareGrant {
  ownerUserId: string;
  folderId: string;
  recipientUserId: string;
  role: string;
}

export interface SharePlan {
  grants: ShareGrant[];
  notCarried: {
    nonUserMembers: { folderId: string; accountId: string }[];
    unmappedRoles: { folderId: string; accountId: string; role: string }[];
    nestedWithoutParent: { folderId: string; recipientUserId: string }[];
  };
}

// Jazz AccountRole -> rowboat DEFAULT_ROLES (reader < writer < admin). Jazz `manager` and
// `writeOnly` have no rowboat equivalent and are reported instead of granted. A rowboat admin can
// revoke or demote other admins, a Jazz admin could not, so admin grants are counted in the output.
const ROWBOAT_ROLE: Record<string, string> = { reader: 'reader', writer: 'writer', admin: 'admin' };

export function planShares(users: ExportUser[]): SharePlan {
  const userIdByAccount = new Map(users.map((u) => [u.accountId, u.userId]));
  const plan: SharePlan = {
    grants: [],
    notCarried: { nonUserMembers: [], unmappedRoles: [], nestedWithoutParent: [] },
  };

  for (const user of users) {
    const exported = new Map(user.folders.map((f) => [f.id, f]));
    const written = planUser(user).folders;
    const parentOf = new Map(written.map((d) => [d.id, d.parent_id]));
    const candidates: ShareGrant[] = [];

    for (const { id } of written) {
      const members = exported.get(id)?.members;
      if (!members) throw new Error(`folder ${id} has no members; re-run the export`);
      for (const member of members) {
        if (member.accountId === user.accountId) continue;
        const recipientUserId = userIdByAccount.get(member.accountId);
        if (recipientUserId === undefined) {
          plan.notCarried.nonUserMembers.push({ folderId: id, accountId: member.accountId });
          continue;
        }
        const role = ROWBOAT_ROLE[member.role];
        if (role === undefined) {
          plan.notCarried.unmappedRoles.push({ folderId: id, accountId: member.accountId, role: member.role });
          continue;
        }
        candidates.push({ ownerUserId: user.userId, folderId: id, recipientUserId, role });
      }
    }

    // The app lists only parent_id-null folders at the top and reaches the rest through their
    // parent, so a nested folder shared without any ancestor would be pulled but never shown.
    const granted = new Set(candidates.map((g) => `${g.recipientUserId}\n${g.folderId}`));
    for (const grant of candidates) {
      let ancestor = parentOf.get(grant.folderId) ?? null;
      while (ancestor !== null && !granted.has(`${grant.recipientUserId}\n${ancestor}`)) {
        ancestor = parentOf.get(ancestor) ?? null;
      }
      const reachable = parentOf.get(grant.folderId) === null || ancestor !== null;
      if (reachable) plan.grants.push(grant);
      else plan.notCarried.nestedWithoutParent.push({ folderId: grant.folderId, recipientUserId: grant.recipientUserId });
    }
  }
  return plan;
}

export function shareReportLines(plan: SharePlan): string[] {
  const nc = plan.notCarried;
  const adminGrants = plan.grants.filter((g) => g.role === 'admin').length;
  return [
    ...plan.grants.map(
      (g) => `share grant owner=${g.ownerUserId} folder=${g.folderId} recipient=${g.recipientUserId} role=${g.role}`,
    ),
    `shares granted=${plan.grants.length} admin-grants=${adminGrants} non-user-members=${nc.nonUserMembers.length} unmapped-roles=${nc.unmappedRoles.length} nested-without-parent=${nc.nestedWithoutParent.length}`,
    ...nc.nonUserMembers.map(
      (m) => `share-not-carried folder=${m.folderId} member=${m.accountId} reason=not-a-migrated-user`,
    ),
    ...nc.unmappedRoles.map(
      (u) => `share-not-carried folder=${u.folderId} member=${u.accountId} role=${u.role} reason=unmapped-role`,
    ),
    ...nc.nestedWithoutParent.map(
      (n) => `share-not-carried folder=${n.folderId} recipient=${n.recipientUserId} reason=nested-without-parent`,
    ),
  ];
}

export function splitForeignFolders(
  userId: string,
  foreignFolders: string[],
  grants: ShareGrant[],
): { carriedAsShare: string[]; notCarried: string[] } {
  const sharedIn = new Set(grants.filter((g) => g.recipientUserId === userId).map((g) => g.folderId));
  return {
    carriedAsShare: foreignFolders.filter((id) => sharedIn.has(id)),
    notCarried: foreignFolders.filter((id) => !sharedIn.has(id)),
  };
}
