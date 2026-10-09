import type { UserSettingsRow } from '../../../shared/schema.js';
import type { FolderRowDraft, UserPlan } from './map.js';

export interface TenantFolder {
  id: string;
  name: string;
  parent_id: string | null;
  owner_group_id: string;
  created_by: string;
}

export interface TenantState {
  folders: TenantFolder[];
  hasUserSettings: boolean;
}

export interface PlanWriter {
  mintGroup(parentGroup: string | undefined): Promise<string>;
  createFolder(row: FolderRowDraft & { owner_group_id: string }): Promise<void>;
  createUserSettings(row: UserSettingsRow): Promise<void>;
}

export interface AppliedPlan {
  groups: Map<string, string>; // folder id -> owning group id
  existingFolders: number;
  existingUserSettings: boolean;
}

// A folder row carries its items and sessions, so one already in the tenant is complete. All checks
// run before the first write, so a tenant that does not match the backup fails without minting.
function existingOwnFolders(plan: UserPlan, tenant: TenantState): Map<string, TenantFolder> {
  const planned = new Map(plan.folders.map((d) => [d.id, d]));
  const existing = new Map<string, TenantFolder>();
  for (const row of tenant.folders) {
    // Another user's folder is visible here once a share to this user has been granted.
    if (row.created_by !== plan.userId) continue;
    const draft = planned.get(row.id);
    if (draft === undefined) {
      throw new Error(`user ${plan.userId} folder ${row.id} is in the tenant but not in the backup`);
    }
    if (row.name !== draft.name || row.parent_id !== draft.parent_id) {
      throw new Error(
        `user ${plan.userId} folder ${row.id} in the tenant differs from the backup: name ${JSON.stringify(row.name)} parent_id ${row.parent_id}`,
      );
    }
    existing.set(row.id, row);
  }
  for (const row of existing.values()) {
    if (row.parent_id !== null && !existing.has(row.parent_id)) {
      throw new Error(`user ${plan.userId} folder ${row.id} is in the tenant but its parent ${row.parent_id} is not`);
    }
  }
  return existing;
}

export async function applyPlan(plan: UserPlan, tenant: TenantState, writer: PlanWriter): Promise<AppliedPlan> {
  const existing = existingOwnFolders(plan, tenant);
  const groups = new Map<string, string>();
  for (const draft of plan.folders) {
    const live = existing.get(draft.id);
    if (live !== undefined) {
      groups.set(draft.id, live.owner_group_id);
      continue;
    }
    let parentGroup: string | undefined;
    if (draft.parent_id !== null) {
      parentGroup = groups.get(draft.parent_id);
      if (parentGroup === undefined) {
        throw new Error(`folder ${draft.id} has parent ${draft.parent_id} with no minted group`);
      }
    }
    const groupId = await writer.mintGroup(parentGroup);
    groups.set(draft.id, groupId);
    await writer.createFolder({ ...draft, owner_group_id: groupId });
  }
  if (!tenant.hasUserSettings) await writer.createUserSettings(plan.userSettings);
  return { groups, existingFolders: existing.size, existingUserSettings: tenant.hasUserSettings };
}
