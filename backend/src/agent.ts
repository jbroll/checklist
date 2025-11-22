import { startWorker } from 'jazz-tools/worker';
import { Account, type ID, CoMap } from 'jazz-tools';

// Agent for server-side Jazz operations
let worker: Account | null = null;

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
    console.log(`   Account ID: ${accountId}`);
    console.log(`   Sync server: ${syncServer}`);
  } catch (error) {
    console.error('❌ Failed to initialize Jazz agent:', error);
    throw error;
  }
}

/**
 * Validate that sender still has access to folder
 *
 * Loads the folder and checks if sender account is a member of the folder's owner group
 */
export async function validateSenderAccess(
  folderCoValueId: string,
  senderJazzAccountId: string
): Promise<boolean> {
  if (!worker) {
    console.error('Jazz agent not initialized - cannot validate access');
    return false;
  }

  try {
    // Load the folder CoValue as a generic CoMap
    const folder = await CoMap.load(folderCoValueId as ID<CoMap>, {
      loadAs: worker,
    });

    if (!folder) {
      console.warn(`Folder ${folderCoValueId} not found`);
      return false;
    }

    // Load sender's account
    const senderAccount = await Account.load(senderJazzAccountId as ID<Account>, {
      loadAs: worker,
    });

    if (!senderAccount) {
      console.warn(`Sender account ${senderJazzAccountId} not found`);
      return false;
    }

    // Check if sender is in the folder's owner group
    const ownerGroup = folder.$jazz.owner;

    // Get all members of the group
    const members = ownerGroup.members;

    // Check if sender is a member (any role)
    // members is an array of { account: Account, id: string, role: string }
    const isMember = members.some((member: { id: string }) =>
      member.id === senderJazzAccountId
    );

    console.log(`Access validation: ${senderJazzAccountId} ${isMember ? 'HAS' : 'DOES NOT HAVE'} access to ${folderCoValueId}`);

    return isMember;
  } catch (error) {
    console.error('Error validating sender access:', error);
    return false;
  }
}

/**
 * Add a user to a folder's access group
 *
 * Loads the folder and adds the recipient to the folder's owner group with the specified role
 */
export async function addToFolderGroup(
  folderCoValueId: string,
  recipientJazzAccountId: string,
  permission: 'view' | 'edit' | 'admin'
): Promise<void> {
  if (!worker) {
    throw new Error('Jazz agent not initialized - cannot add member to group');
  }

  try {
    // Load the folder CoValue as a generic CoMap
    const folder = await CoMap.load(folderCoValueId as ID<CoMap>, {
      loadAs: worker,
    });

    if (!folder) {
      throw new Error(`Folder ${folderCoValueId} not found`);
    }

    // Load recipient's account
    const recipientAccount = await Account.load(recipientJazzAccountId as ID<Account>, {
      loadAs: worker,
    });

    if (!recipientAccount) {
      throw new Error(`Recipient account ${recipientJazzAccountId} not found`);
    }

    // Map permission to Jazz role
    // 'view' -> 'reader' (can read only)
    // 'edit' -> 'writer' (can read and write)
    // 'admin' -> 'admin' (can read, write, and manage group)
    const jazzRole = permission === 'view' ? 'reader' : permission === 'edit' ? 'writer' : 'admin';

    // Add member to folder's owner group
    const ownerGroup = folder.$jazz.owner;
    ownerGroup.addMember(recipientAccount, jazzRole);

    console.log(`✅ Added ${recipientJazzAccountId} to ${folderCoValueId} with role ${jazzRole}`);

    // Wait for sync to ensure the change is persisted
    await ownerGroup.$jazz.waitForSync();
  } catch (error) {
    console.error('Error adding member to folder group:', error);
    throw error;
  }
}

/**
 * Get all members of a folder's access group
 *
 * Returns list of members with their roles
 */
export async function getFolderGroupMembers(
  folderCoValueId: string
): Promise<Array<{ id: string; role: string }>> {
  if (!worker) {
    throw new Error('Jazz agent not initialized - cannot get group members');
  }

  try {
    // Load the folder CoValue as a generic CoMap
    const folder = await CoMap.load(folderCoValueId as ID<CoMap>, {
      loadAs: worker,
    });

    if (!folder) {
      throw new Error(`Folder ${folderCoValueId} not found`);
    }

    // Get all members of the group
    const ownerGroup = folder.$jazz.owner;
    const members = ownerGroup.members;

    // Return member IDs and roles
    return members.map((member: { id: string; role: string }) => ({
      id: member.id,
      role: member.role,
    }));
  } catch (error) {
    console.error('Error getting folder group members:', error);
    throw error;
  }
}

/**
 * Remove a user from a folder's access group
 */
export async function removeFromFolderGroup(
  folderCoValueId: string,
  userJazzAccountId: string
): Promise<void> {
  if (!worker) {
    throw new Error('Jazz agent not initialized - cannot remove member from group');
  }

  try {
    // Load the folder CoValue as a generic CoMap
    const folder = await CoMap.load(folderCoValueId as ID<CoMap>, {
      loadAs: worker,
    });

    if (!folder) {
      throw new Error(`Folder ${folderCoValueId} not found`);
    }

    // Load user's account
    const userAccount = await Account.load(userJazzAccountId as ID<Account>, {
      loadAs: worker,
    });

    if (!userAccount) {
      throw new Error(`User account ${userJazzAccountId} not found`);
    }

    // Remove member from folder's owner group
    const ownerGroup = folder.$jazz.owner;
    ownerGroup.removeMember(userAccount);

    console.log(`✅ Removed ${userJazzAccountId} from ${folderCoValueId}`);

    // Wait for sync
    await ownerGroup.$jazz.waitForSync();
  } catch (error) {
    console.error('Error removing member from folder group:', error);
    throw error;
  }
}
