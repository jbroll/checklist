# Jazz Agent Setup Guide

The Jazz agent is a server-side Jazz account that enables the backend to:
- Load CoValues on behalf of users
- Validate user access to folders
- Add users to folder groups (sharing functionality)

## Prerequisites

- Node.js v20 or later
- Access to a Jazz sync server (default: wss://cloud.jazz.tools)
- `jazz-run` package (installed as a dependency of `jazz-tools`)

## Setup Steps

### 1. Create a Jazz Worker Account

Run the following command to create a new Jazz worker account:

```bash
npx jazz-run create-worker --peer wss://cloud.jazz.tools
```

This will output something like:

```
Worker account created successfully!

Account ID: co_z1234567890abcdefghijklmnopqrstuvwxyz
Account Secret: your-secret-key-here-very-long-string

Save these credentials securely!
```

### 2. Configure Environment Variables

Add the credentials to your `backend/.env` file:

```env
JAZZ_AGENT_ACCOUNT_ID=co_z1234567890abcdefghijklmnopqrstuvwxyz
JAZZ_AGENT_SECRET=your-secret-key-here-very-long-string
```

**IMPORTANT**: Keep these credentials secure! They give full access to the agent account.

### 3. Verify Setup

Start the backend server:

```bash
cd backend
npm run dev
```

You should see:

```
✅ Jazz agent initialized
   Account ID: co_z1234567890abcdefghijklmnopqrstuvwxyz
   Sync server: wss://cloud.jazz.tools
```

If you see a warning instead, double-check your environment variables.

## How It Works

### Agent Initialization

The agent is initialized when the backend starts (`backend/src/index.ts`):

```typescript
import { initAgent } from './agent.js';
initAgent();
```

This uses `startWorker` from `jazz-tools/worker` to create a server-side account.

### Loading CoValues

The agent can load any CoValue by ID:

```typescript
const folder = await FolderNode.load(folderId, {
  loadAs: worker,
  resolve: {
    owner: true,
  },
});
```

### Checking Access

To validate a user has access to a folder:

```typescript
import { validateSenderAccess } from './agent.js';

const hasAccess = await validateSenderAccess(
  'co_z123...', // folder ID
  'co_z456...'  // user account ID
);
```

This checks if the user is a member of the folder's owner group.

### Adding Users to Groups

To share a folder with a user:

```typescript
import { addToFolderGroup } from './agent.js';

await addToFolderGroup(
  'co_z123...', // folder ID
  'co_z456...', // user account ID
  'edit'        // 'view' | 'edit' | 'admin'
);
```

Permission mapping:
- `'view'` → Jazz role `'reader'` (read-only access)
- `'edit'` → Jazz role `'writer'` (read and write access)
- `'admin'` → Jazz role `'admin'` (full access including group management)

## Troubleshooting

### Agent Not Initialized Warning

```
⚠️  Jazz agent not configured (missing JAZZ_AGENT_ACCOUNT_ID or JAZZ_AGENT_SECRET)
   Sharing features will not work until agent is configured
```

**Solution**: Make sure both `JAZZ_AGENT_ACCOUNT_ID` and `JAZZ_AGENT_SECRET` are set in your `.env` file.

### Failed to Initialize Jazz Agent

```
❌ Failed to initialize Jazz agent: [error details]
```

**Common causes**:
1. Invalid account ID or secret
2. Cannot connect to sync server (check your internet connection)
3. Sync server URL is incorrect

**Solution**:
- Verify your credentials are correct
- Check that `JAZZ_PEER` is set to a valid sync server URL
- Try recreating the worker account

### Cannot Load CoValue

If the agent cannot load a CoValue:

1. Check that the CoValue ID is correct
2. Ensure the agent account has been added to the CoValue's owner group (for private CoValues)
3. Verify the CoValue actually exists

### Permission Errors

If users cannot access shared folders:

1. Verify the agent successfully added the user to the group
2. Check the server logs for detailed error messages
3. Ensure the folder's owner group allows the requested permission level

## Security Considerations

1. **Keep credentials secure**: Never commit `.env` files to version control
2. **Rotate credentials periodically**: Create a new worker account and update the `.env`
3. **Monitor access**: Log all access validation and group membership changes
4. **Validate user input**: Always validate folder and user IDs before operations

## API Reference

### `initAgent()`

Initializes the Jazz agent/worker.

**Environment Variables:**
- `JAZZ_AGENT_ACCOUNT_ID`: Worker account ID
- `JAZZ_AGENT_SECRET`: Worker account secret
- `JAZZ_PEER`: Jazz sync server URL (default: `wss://cloud.jazz.tools`)

**Returns**: `Promise<void>`

**Throws**: Error if initialization fails

### `validateSenderAccess(folderCoValueId, senderJazzAccountId)`

Validates that a user has access to a folder.

**Parameters:**
- `folderCoValueId: string` - The folder's CoValue ID
- `senderJazzAccountId: string` - The user's account ID

**Returns**: `Promise<boolean>` - `true` if user has access, `false` otherwise

### `addToFolderGroup(folderCoValueId, recipientJazzAccountId, permission)`

Adds a user to a folder's access group with specified permission.

**Parameters:**
- `folderCoValueId: string` - The folder's CoValue ID
- `recipientJazzAccountId: string` - The recipient's account ID
- `permission: 'view' | 'edit' | 'admin'` - The permission level

**Returns**: `Promise<void>`

**Throws**: Error if operation fails

## Additional Resources

- [Jazz Documentation](https://jazz.tools/docs)
- [Jazz Worker/Agent Guide](https://jazz.tools/docs/reference/server-workers)
- [Jazz Groups and Permissions](https://jazz.tools/docs/permissions-and-sharing/groups)
