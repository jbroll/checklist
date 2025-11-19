// Minimal Jazz agent for group management
// TODO: Replace with actual Jazz agent API

let agent: any = null;

export async function initAgent() {
  const secret = process.env.JAZZ_AGENT_SECRET;
  if (!secret) throw new Error('JAZZ_AGENT_SECRET required');

  // TODO: agent = await JazzAgent.create({ secret });
  console.log('⚠️  Jazz agent stub initialized');
}

/**
 * Validate that sender still has access to folder
 *
 * @param folderCoValueId - Folder CoValue ID
 * @param senderJazzAccountId - Sender's Jazz account ID
 * @returns true if sender has access, false otherwise
 */
export async function validateSenderAccess(
  folderCoValueId: string,
  senderJazzAccountId: string
): Promise<boolean> {
  // TODO:
  // const folder = await agent.load(folderCoValueId);
  // return folder.accessGroup.hasMember(senderJazzAccountId);

  console.log(`TODO: Validate ${senderJazzAccountId} has access to ${folderCoValueId}`);
  return true; // Stub: always valid for now
}

/**
 * Add a user to a folder's access group
 *
 * @param folderCoValueId - Folder CoValue ID
 * @param recipientJazzAccountId - Recipient's Jazz account ID (looked up at acceptance time)
 * @param permission - Permission level to grant
 */
export async function addToFolderGroup(
  folderCoValueId: string,
  recipientJazzAccountId: string,
  permission: 'view' | 'edit' | 'admin'
): Promise<void> {
  // TODO:
  // const folder = await agent.load(folderCoValueId);
  //
  // if (!folder.accessGroup) {
  //   folder.accessGroup = FolderAccessGroup.create({ owner: folder.owner });
  // }
  //
  // // Map permission to Jazz role
  // const jazzRole = permission === 'view' ? 'reader' : 'writer';
  // await folder.accessGroup.addMember(recipientJazzAccountId, jazzRole);
  //
  // // Create permission metadata
  // const permissionMetadata = MemberPermission.create({
  //   accountId: recipientJazzAccountId,
  //   permission: permission,
  //   addedBy: folder.owner,
  //   addedAt: new Date(),
  // }, { owner: folder.owner });
  //
  // folder.permissions.push(permissionMetadata);

  console.log(`TODO: Add ${recipientJazzAccountId} to ${folderCoValueId} with ${permission}`);
}
