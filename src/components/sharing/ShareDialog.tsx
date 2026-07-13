import type { Collaborator, InviteToken } from '@jbroll/rowboat-sharing-react';
import { useSharing } from '@jbroll/rowboat-sharing-react';
import { Share2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import type { FolderRow } from '@/schema/folder';

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

  const groupId = folder.owner_group_id;

  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [pendingInvites, setPendingInvites] = useState<InviteToken[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [lastShareUrl, setLastShareUrl] = useState<string | null>(null);

  const [recipient, setRecipient] = useState('');
  const [role, setRole] = useState<Role>('writer');
  const [expiresInDays, setExpiresInDays] = useState(7);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: sharing methods are stable via useCallback in the hook
  const loadAccessData = useCallback(async () => {
    setIsLoadingData(true);
    try {
      const [collabs, invites] = await Promise.all([
        sharing.getCollaborators(groupId),
        sharing.getPendingInvites(groupId),
      ]);
      setCollaborators(collabs);
      setPendingInvites(invites);
    } catch (err) {
      console.error('Failed to load share access data:', err);
    } finally {
      setIsLoadingData(false);
    }
  }, [groupId]);

  useEffect(() => {
    if (open) {
      loadAccessData();
    } else {
      setLastShareUrl(null);
      setSuccessMessage(null);
      setFormError(null);
      setRecipient('');
    }
  }, [open, loadAccessData]);

  const handleCreateInvite = useCallback(
    async (sendEmail: boolean) => {
      const trimmed = recipient.trim();
      if (!trimmed) return;

      setFormError(null);
      setSuccessMessage(null);
      setIsCreating(true);
      try {
        const result = await sharing.createInvite(groupId, trimmed, role, {
          sendEmail,
          expiresInDays,
        });
        setLastShareUrl(result.shareUrl);
        setSuccessMessage(result.emailSent ? `Invite emailed to ${trimmed}` : 'Invite link ready');
        setRecipient('');
        await loadAccessData();
      } catch (err) {
        setFormError(err instanceof Error ? err.message : 'Failed to create invite');
      } finally {
        setIsCreating(false);
      }
    },
    [recipient, role, expiresInDays, groupId, loadAccessData, sharing.createInvite],
  );

  const handleRemoveCollaborator = useCallback(
    async (accountId: string) => {
      if (!confirm('Remove this collaborator? They will lose access to this folder.')) return;
      try {
        await sharing.removeCollaborator(groupId, accountId);
      } catch (err) {
        console.error('Failed to remove collaborator', accountId, err);
      }
      await loadAccessData();
    },
    [groupId, loadAccessData, sharing.removeCollaborator],
  );

  const handleRevokeInvite = useCallback(
    async (token: string) => {
      const invite = pendingInvites.find((i) => i.token === token);
      const label = invite?.recipientEmail ?? token;
      if (!confirm(`Revoke invite for ${label}? They will no longer be able to use this link.`))
        return;
      try {
        await sharing.revokeInvite(token);
      } catch (err) {
        console.error('Failed to revoke invite', label, err);
      }
      await loadAccessData();
    },
    [pendingInvites, loadAccessData, sharing.revokeInvite],
  );

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
            {isLoadingData ? (
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
