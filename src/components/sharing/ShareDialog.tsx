import { SharingError, useShareManager, useSharing } from '@jbroll/rowboat-sharing-react';
import { Share2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import type { FolderRow } from '@/schema/folder';
import { logSharingError, withErrorCode } from './sharingErrorText';

type Role = 'reader' | 'writer' | 'admin';

const ROLES: readonly Role[] = ['reader', 'writer', 'admin'];

const ROLE_LABELS: Record<Role, string> = {
  reader: 'Reader',
  writer: 'Writer',
  admin: 'Admin',
};

const ROLE_COLORS: Record<Role, { bg: string; text: string }> = {
  reader: { bg: 'bg-blue-100', text: 'text-blue-700' },
  writer: { bg: 'bg-green-100', text: 'text-green-700' },
  admin: { bg: 'bg-purple-100', text: 'text-purple-700' },
};

const MAX_TARGET_NAME_LENGTH = 200;

// The server rejects a targetName that is empty, over 200 UTF-16 units, or holds a line break.
export function inviteTargetName(name: string): string | undefined {
  let oneLine = name.replace(/\s+/g, ' ').trim().slice(0, MAX_TARGET_NAME_LENGTH);
  if (/[\uD800-\uDBFF]$/.test(oneLine)) oneLine = oneLine.slice(0, -1);
  return oneLine.trimEnd() || undefined;
}

function shareErrorMessage(err: Error): string {
  const code = err instanceof SharingError ? err.code : null;
  switch (code) {
    case 'root_group':
      return withErrorCode(
        "This list can't be shared as it is: it lives in your account's private group.",
        err,
      );
    case 'forbidden':
      return withErrorCode('Only an admin of this list can share it.', err);
    default:
      return withErrorCode('Something went wrong. Please try again.', err);
  }
}

interface ShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folder: FolderRow;
}

export function ShareDialog({ open, onOpenChange, folder }: ShareDialogProps) {
  const sharing = useSharing({
    apiBaseUrl: '/api/shares',
    fetchFn: (input, init) => fetch(input, { ...init, credentials: 'include' }),
  });
  // Every tree row mounts a closed dialog, so only an open one loads its group.
  const { collaborators, pendingInvites, loading, error, lastShareUrl, invite, remove, revoke } =
    useShareManager(open ? folder.owner_group_id : null, sharing);

  const [recipient, setRecipient] = useState('');
  const [role, setRole] = useState<Role>('writer');
  const [expiresInDays, setExpiresInDays] = useState(7);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (!open) {
      setSuccessMessage(null);
      setRecipient('');
    }
  }, [open]);

  const handleCreateInvite = useCallback(
    async (sendEmail: boolean) => {
      const trimmed = recipient.trim();
      if (!trimmed) return;

      setSuccessMessage(null);
      setIsCreating(true);
      const result = await invite(trimmed, role, {
        sendEmail,
        expiresInDays,
        targetName: inviteTargetName(folder.name),
      });
      setIsCreating(false);
      if (!result) return;
      setSuccessMessage(result.emailSent ? `Invite emailed to ${trimmed}` : 'Invite link ready');
      setRecipient('');
    },
    [recipient, role, expiresInDays, folder.name, invite],
  );

  const handleRemoveCollaborator = useCallback(
    async (accountId: string) => {
      if (!confirm('Remove this collaborator? They will lose access to this folder.')) return;
      await remove(accountId);
    },
    [remove],
  );

  const handleRevokeInvite = useCallback(
    async (token: string) => {
      const pending = pendingInvites.find((i) => i.token === token);
      const label = pending?.recipientEmail ?? token;
      if (!confirm(`Revoke invite for ${label}? They will no longer be able to use this link.`))
        return;
      await revoke(token);
    },
    [pendingInvites, revoke],
  );

  useEffect(() => logSharingError('share dialog', error), [error]);

  const formError = error ? shareErrorMessage(error) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-5 w-5" />
            Share "{folder.name}"
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-4 space-y-6">
          <div className="space-y-3">
            <Input
              type="text"
              placeholder="colleague@example.com"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
            />

            <div className="flex items-center gap-3">
              <label htmlFor="share-role" className="text-sm text-content-secondary">
                Permission
              </label>
              <select
                id="share-role"
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
                className="rounded-md border border-divider-tertiary bg-surface-elevated px-2 py-1.5 text-sm text-content-primary"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>

              <label htmlFor="share-expires" className="text-sm text-content-secondary">
                Expires in
              </label>
              <select
                id="share-expires"
                value={expiresInDays}
                onChange={(e) => setExpiresInDays(Number(e.target.value))}
                className="rounded-md border border-divider-tertiary bg-surface-elevated px-2 py-1.5 text-sm text-content-primary"
              >
                {[1, 7, 14, 30].map((d) => (
                  <option key={d} value={d}>
                    {d} day{d === 1 ? '' : 's'}
                  </option>
                ))}
              </select>
            </div>

            {formError && <p className="text-sm text-red-600">{formError}</p>}
            {successMessage && <p className="text-sm text-green-700">{successMessage}</p>}

            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={isCreating || !recipient.trim()}
                onClick={() => void handleCreateInvite(false)}
              >
                Copy link
              </Button>
              <Button
                type="button"
                variant="primary"
                disabled={isCreating || !recipient.trim()}
                onClick={() => void handleCreateInvite(true)}
              >
                Email invite
              </Button>
            </div>

            {lastShareUrl && (
              <div className="mt-2">
                <p className="mb-1 text-xs text-content-secondary">
                  If they don't receive it, send them this link:
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={lastShareUrl}
                    className="min-w-0 flex-1 truncate rounded border border-divider-primary bg-surface-tertiary px-3 py-1.5 text-xs text-content-secondary"
                  />
                  <button
                    type="button"
                    onClick={() => void navigator.clipboard.writeText(lastShareUrl)}
                    className="rounded bg-interactive-hover px-3 py-1.5 text-xs font-medium text-content-primary hover:bg-divider-primary"
                  >
                    Copy
                  </button>
                </div>
              </div>
            )}
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-content-primary">
              Collaborators {collaborators.length > 0 && `(${collaborators.length})`}
            </p>
            {loading ? (
              <p className="text-sm text-content-secondary">Loading...</p>
            ) : collaborators.length === 0 ? (
              <p className="text-sm text-content-secondary">No collaborators yet</p>
            ) : (
              <ul className="space-y-2">
                {collaborators.map((c) => (
                  <li key={c.accountId} className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-content-primary">
                        {c.name ?? c.email ?? c.accountId}
                      </span>
                      <span
                        className={`inline-block rounded px-1.5 py-0.5 text-xs ${ROLE_COLORS[c.role as Role]?.bg ?? 'bg-surface-tertiary'} ${ROLE_COLORS[c.role as Role]?.text ?? 'text-content-secondary'}`}
                      >
                        {ROLE_LABELS[c.role as Role] ?? c.role}
                      </span>
                    </div>
                    <button
                      type="button"
                      aria-label={`Remove ${c.name ?? c.email ?? c.accountId}`}
                      onClick={() => void handleRemoveCollaborator(c.accountId)}
                      className="shrink-0 text-sm text-red-600 hover:underline"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {pendingInvites.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-medium text-content-primary">
                Pending Invites ({pendingInvites.length})
              </p>
              <ul className="space-y-2">
                {pendingInvites.map((inv) => (
                  <li key={inv.token} className="flex items-center justify-between gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm text-content-primary">
                      {inv.recipientEmail}
                    </span>
                    <button
                      type="button"
                      aria-label="Revoke invite"
                      onClick={() => void handleRevokeInvite(inv.token)}
                      className="shrink-0 text-sm text-red-600 hover:underline"
                    >
                      Revoke
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex justify-end border-t border-divider-primary pt-4">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
