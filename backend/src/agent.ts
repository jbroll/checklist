// Minimal Jazz agent for group management
// TODO: Replace with actual Jazz agent API

let agent: any = null;

export async function initAgent() {
  const secret = process.env.JAZZ_AGENT_SECRET;
  if (!secret) throw new Error('JAZZ_AGENT_SECRET required');

  // TODO: agent = await JazzAgent.create({ secret });
  console.log('⚠️  Jazz agent stub initialized');
}

export async function addToFolderGroup(
  folderCoValueId: string,
  recipientJazzAccountId: string,
  permission: 'view' | 'edit' | 'admin'
) {
  // TODO:
  // const folder = await agent.load(folderCoValueId);
  // const role = permission === 'view' ? 'reader' : 'writer';
  // await folder.accessGroup.addMember(recipientJazzAccountId, role);

  console.log(`TODO: Add ${recipientJazzAccountId} to ${folderCoValueId} with ${permission}`);
}
