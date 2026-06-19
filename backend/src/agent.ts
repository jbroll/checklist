import { startWorker } from 'jazz-tools/worker';
import type { ID } from 'jazz-tools';
import { Account, CoMap } from './jazz';

// Agent for server-side Jazz operations
let worker: Account | null = null;

/**
 * Check if the Jazz agent is ready for operations
 */
export function isAgentReady(): boolean {
  return worker !== null;
}

/**
 * Initialize the Jazz agent/worker
 *
 * Uses startWorker to create a server-side account that can load CoValues
 * and manage group memberships on behalf of the backend.
 */
export async function initAgent() {
  const accountId = process.env.JAZZ_AGENT_ACCOUNT_ID;
  const accountSecret = process.env.JAZZ_AGENT_SECRET;
  const jazzPeer = process.env.JAZZ_PEER || 'wss://cloud.jazz.tools';
  const jazzApiKey = process.env.JAZZ_API_KEY;

  if (!accountId || !accountSecret) {
    console.warn('⚠️  Jazz agent not configured (missing JAZZ_AGENT_ACCOUNT_ID or JAZZ_AGENT_SECRET)');
    console.warn('   Sharing features will not work until agent is configured');
    return;
  }

  // Append API key to sync server URL if provided
  const syncServer = jazzApiKey ? `${jazzPeer}/?key=${jazzApiKey}` : jazzPeer;

  try {
    const result = await startWorker({
      syncServer: syncServer,
      accountID: accountId as ID<Account>,
      accountSecret: accountSecret,
    });

    worker = result.worker;
    console.log('✅ Jazz agent initialized');
    console.log(`   Account ID: ${accountId.slice(0, 12)}...`);
    // Don't log sync server URL - it may contain API key
    console.log(`   Sync server: ${jazzPeer}`);
  } catch (error) {
    console.error('❌ Failed to initialize Jazz agent:', error);
    throw error;
  }
}

/**
 * Validate that sender still has access to target CoValue
 *
 * Loads the target and checks if sender account is a member of the target's owner group
 */
export async function validateSenderAccess(
  targetId: string,
  senderJazzAccountId: string
): Promise<boolean> {
  if (!worker) {
    console.error('Jazz agent not initialized - cannot validate access');
    return false;
  }

  try {
    // Load the target CoValue as a generic CoMap
    const target = await CoMap.load(targetId as ID<CoMap>, {
      loadAs: worker,
    });

    if (!target || !('_owner' in target)) {
      console.warn(`Target ${targetId} not found or not loaded`);
      return false;
    }

    // Load sender's account
    const senderAccount = await Account.load(senderJazzAccountId as ID<Account>, {
      loadAs: worker,
    });

    if (!senderAccount || !('id' in senderAccount) || 'loadingState' in senderAccount) {
      console.warn(`Sender account ${senderJazzAccountId} not found`);
      return false;
    }

    // Check if sender is in the target's owner group
    // biome-ignore lint/suspicious/noExplicitAny: Jazz types are complex
    const ownerGroup = (target as any)._owner;

    // Get all members of the group
    const members = ownerGroup.members;

    // Check if sender is a member (any role)
    // members is an array of { account: Account, id: string, role: string }
    const isMember = members.some((member: { id: string }) =>
      member.id === senderJazzAccountId
    );

    // Log with truncated IDs for privacy
    console.log(`Access validation: ${senderJazzAccountId.slice(0, 12)}... ${isMember ? 'HAS' : 'DOES NOT HAVE'} access to ${targetId.slice(0, 12)}...`);

    return isMember;
  } catch (error) {
    console.error('Error validating sender access:', error);
    return false;
  }
}

/**
 * Add a user to a target's access group
 *
 * Loads the target and adds the recipient to the target's owner group with the specified role.
 * Uses Jazz native role names: reader, writer, admin
 */
export async function addToGroup(
  targetId: string,
  recipientJazzAccountId: string,
  permission: 'reader' | 'writer' | 'admin'
): Promise<{ alreadyMember: boolean }> {
  if (!worker) {
    throw new Error('Jazz agent not initialized - cannot add member to group');
  }

  try {
    // Load the target CoValue as a generic CoMap
    const target = await CoMap.load(targetId as ID<CoMap>, {
      loadAs: worker,
    });

    if (!target || !('_owner' in target)) {
      throw new Error(`Target ${targetId} not found`);
    }

    // Load recipient's account
    const recipientAccount = await Account.load(recipientJazzAccountId as ID<Account>, {
      loadAs: worker,
    });

    if (!recipientAccount || !('id' in recipientAccount) || 'loadingState' in recipientAccount) {
      throw new Error(`Recipient account ${recipientJazzAccountId} not found`);
    }

    // Add member to target's owner group
    // biome-ignore lint/suspicious/noExplicitAny: Jazz types are complex
    const ownerGroup = (target as any)._owner;

    // Check if already a member
    const existingMember = ownerGroup.members.find(
      (m: { id: string }) => m.id === recipientJazzAccountId
    );

    if (existingMember) {
      console.log(`⚠️ User ${recipientJazzAccountId.slice(0, 12)}... is already a member of ${targetId.slice(0, 12)}... - skipping`);
      return { alreadyMember: true };
    }

    ownerGroup.addMember(recipientAccount, permission);

    console.log(`✅ Added ${recipientJazzAccountId.slice(0, 12)}... to ${targetId.slice(0, 12)}... with role ${permission}`);

    // Wait for sync to ensure the change is persisted
    await ownerGroup.waitForSync();

    return { alreadyMember: false };
  } catch (error) {
    console.error('Error adding member to group:', error);
    throw error;
  }
}

/**
 * Get all members of a target's access group
 *
 * Returns list of members with their roles
 */
export async function getGroupMembers(
  targetId: string
): Promise<Array<{ id: string; role: string }>> {
  if (!worker) {
    throw new Error('Jazz agent not initialized - cannot get group members');
  }

  try {
    // Load the target CoValue as a generic CoMap
    const target = await CoMap.load(targetId as ID<CoMap>, {
      loadAs: worker,
    });

    if (!target || !('_owner' in target)) {
      throw new Error(`Target ${targetId} not found`);
    }

    // Get all members of the group
    // biome-ignore lint/suspicious/noExplicitAny: Jazz types are complex
    const ownerGroup = (target as any)._owner;

    // Check if owner is a Group (has members property)
    if (!ownerGroup.members) {
      console.error(`Target ${targetId} owner is not a Group (likely an Account from old code)`);
      throw new Error(`Target ${targetId} was created with account ownership. Please create a new item to enable sharing.`);
    }

    const members = ownerGroup.members;

    // Return member IDs and roles
    return members.map((member: { id: string; role: string }) => ({
      id: member.id,
      role: member.role,
    }));
  } catch (error) {
    console.error('Error getting group members:', error);
    throw error;
  }
}

/**
 * Remove a user from a target's access group
 */
export async function removeFromGroup(
  targetId: string,
  userJazzAccountId: string
): Promise<void> {
  if (!worker) {
    throw new Error('Jazz agent not initialized - cannot remove member from group');
  }

  try {
    // Load the target CoValue as a generic CoMap
    const target = await CoMap.load(targetId as ID<CoMap>, {
      loadAs: worker,
    });

    if (!target || !('_owner' in target)) {
      throw new Error(`Target ${targetId} not found`);
    }

    // Prevent removing the group owner (they should always have access)
    // biome-ignore lint/suspicious/noExplicitAny: Jazz types are complex
    const ownerGroup = (target as any)._owner;
    const groupOwner = ownerGroup?._owner as { id: string } | undefined;
    const groupOwnerId = groupOwner?.id;

    if (groupOwnerId === userJazzAccountId) {
      throw new Error('Cannot remove the owner from collaborators. Transfer ownership first.');
    }

    // Load user's account
    const userAccount = await Account.load(userJazzAccountId as ID<Account>, {
      loadAs: worker,
    });

    if (!userAccount || !('id' in userAccount) || 'loadingState' in userAccount) {
      throw new Error(`User account ${userJazzAccountId} not found`);
    }

    // Remove member from target's owner group
    ownerGroup.removeMember(userAccount);

    console.log(`✅ Removed ${userJazzAccountId.slice(0, 12)}... from ${targetId.slice(0, 12)}...`);

    // Wait for sync
    await ownerGroup.waitForSync();
  } catch (error) {
    console.error('Error removing member from group:', error);
    throw error;
  }
}
