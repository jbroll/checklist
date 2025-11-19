// Minimal Jazz agent for group management

let agent: any = null;

export async function initAgent() {
  const secret = process.env.JAZZ_AGENT_SECRET;
  if (!secret) throw new Error('JAZZ_AGENT_SECRET required');

  // TODO: Initialize Jazz agent with secret
  // agent = await Agent.create({ secret });
  console.log('⚠️  Jazz agent stub initialized');
}

/**
 * Validate that sender still has access to folder
 *
 * Jazz folders have built-in groups - just check if sender is a member
 */
export async function validateSenderAccess(
  folderCoValueId: string,
  senderJazzAccountId: string
): Promise<boolean> {
  // TODO: Use Jazz agent API
  // const folder = await agent.load(folderCoValueId);
  // return folder._group.members.includes(senderJazzAccountId);

  console.log(`TODO: Validate ${senderJazzAccountId} has access to ${folderCoValueId}`);
  return true; // Stub: always valid for now
}

/**
 * Add a user to a folder's access group
 *
 * Jazz CoValues have built-in groups - just add the member
 */
export async function addToFolderGroup(
  folderCoValueId: string,
  recipientJazzAccountId: string,
  permission: 'view' | 'edit' | 'admin'
): Promise<void> {
  // TODO: Use Jazz agent API
  // const folder = await agent.load(folderCoValueId);
  //
  // // Map permission to Jazz role
  // const jazzRole = permission === 'view' ? 'reader' : 'writer';
  //
  // // Add member to folder's built-in group
  // await folder._group.addMember(recipientJazzAccountId, jazzRole);

  console.log(`TODO: Add ${recipientJazzAccountId} to ${folderCoValueId} with ${permission}`);
}
