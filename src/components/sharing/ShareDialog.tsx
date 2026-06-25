import { type Permission, useSharing } from '@jbr-jazz/hierarchy-client';
import type { Collaborator, PendingInvite } from '@jbr-jazz/hierarchy-client/components';
import { SharePanel } from '@jbr-jazz/hierarchy-client/components';
import type { InstanceOfSchema } from 'jazz-tools';
import { Share2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { FolderNode } from '@/schema';

const PERMISSION_COLORS = {
  reader: { bg: 'bg-blue-100', text: 'text-blue-700' },
  writer: { bg: 'bg-green-100', text: 'text-green-700' },
  admin: { bg: 'bg-purple-100', text: 'text-purple-700' },
} as const;

interface ShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folder: InstanceOfSchema<typeof FolderNode>;
}

const getAuthHeaders = async (): Promise<Record<string, string>> => ({
  'X-Requested-With': 'XMLHttpRequest',
});

export function ShareDialog({ open, onOpenChange, folder }: ShareDialogProps) {
  const sharing = useSharing({ apiBaseUrl: '', getAuthHeaders });

  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [lastShareUrl, setLastShareUrl] = useState<string | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: sharing methods are stable via useCallback
  const loadAccessData = useCallback(async () => {
    setIsLoadingData(true);
    try {
      const [collabs, invites] = await Promise.all([
        sharing.getCollaborators(folder.$jazz.id),
        sharing.getPendingInvites(folder.$jazz.id),
      ]);
      setCollaborators(collabs as Collaborator[]);
      setPendingInvites(invites as unknown as PendingInvite[]);
    } catch (err) {
      console.error('Failed to load share access data:', err);
    } finally {
      setIsLoadingData(false);
    }
  }, [folder.$jazz.id]);

  useEffect(() => {
    if (open) loadAccessData();
    else setLastShareUrl(null);
  }, [open, loadAccessData]);

  const handleCreateInvite = useCallback(
    async ({
      recipient,
      permission,
      expiresInDays,
      sendEmail,
    }: {
      recipient: string;
      permission: string;
      expiresInDays: number;
      sendEmail: boolean;
    }): Promise<{ shareUrl: string }> => {
      const result = await sharing.createInviteAndGrantAgent(
        folder,
        recipient,
        permission as Permission,
        undefined,
        sendEmail,
        expiresInDays,
      );
      setLastShareUrl(result.shareUrl);
      await loadAccessData();
      return { shareUrl: result.shareUrl };
    },
    [folder, sharing, loadAccessData],
  );

  const handleRemoveCollaborator = useCallback(
    async (accountId: string) => {
      if (!confirm('Remove this collaborator? They will lose access to this folder.')) return;
      const ok = await sharing.removeCollaborator(folder.$jazz.id, accountId);
      if (!ok) console.error('Failed to remove collaborator', accountId);
      await loadAccessData();
    },
    [folder.$jazz.id, sharing, loadAccessData],
  );

  const handleRevokeInvite = useCallback(
    async (token: string) => {
      const invite = pendingInvites.find((i) => i.token === token);
      const label = invite?.recipientEmail ?? token;
      if (!confirm(`Revoke invite for ${label}? They will no longer be able to use this link.`))
        return;
      const ok = await sharing.revokeInvite(token);
      if (!ok) console.error('Failed to revoke invite', label);
      await loadAccessData();
    },
    [pendingInvites, sharing, loadAccessData],
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

        <div className="flex-1 overflow-y-auto py-4">
          <SharePanel
            permissions={['reader', 'writer', 'admin']}
            permissionLabels={{ reader: 'Reader', writer: 'Writer', admin: 'Admin' }}
            permissionColors={PERMISSION_COLORS}
            defaultPermission="writer"
            expirations={[1, 7, 14, 30]}
            defaultExpiresInDays={7}
            recipientPlaceholder="colleague@example.com or +1234567890"
            collaborators={collaborators}
            pendingInvites={pendingInvites}
            onCreateInvite={handleCreateInvite}
            onRemoveCollaborator={handleRemoveCollaborator}
            onRevokeInvite={handleRevokeInvite}
            isLoading={isLoadingData}
            webShareTitle={`Share "${folder.name}"`}
            successMessageFor={({ recipient, sendEmail }) =>
              sendEmail ? `Invite emailed to ${recipient}` : 'Invite link ready'
            }
          >
            {lastShareUrl && (
              <div className="mt-2">
                <p className="mb-1 text-xs text-[var(--jh-text-secondary,#6b7280)]">
                  If they don't receive it, send them this link:
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={lastShareUrl}
                    className="min-w-0 flex-1 truncate rounded border border-[var(--jh-border-primary,#e5e7eb)] bg-[var(--jh-bg-subtle,#f9fafb)] px-3 py-1.5 text-xs text-[var(--jh-text-secondary,#6b7280)]"
                  />
                  <button
                    type="button"
                    onClick={() => void navigator.clipboard.writeText(lastShareUrl)}
                    className="rounded bg-[var(--jh-bg-hover,#f5f5f5)] px-3 py-1.5 text-xs font-medium text-[var(--jh-text-primary,#171717)] hover:bg-[var(--jh-border-primary,#e5e7eb)]"
                  >
                    Copy
                  </button>
                </div>
              </div>
            )}
          </SharePanel>
        </div>

        <div className="flex justify-end border-t border-[var(--jh-border-primary,#e5e7eb)] pt-4">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-md border border-[var(--jh-border-primary,#e5e7eb)] bg-[var(--jh-bg-elevated,#ffffff)] px-4 py-2 text-sm font-medium text-[var(--jh-text-primary,#171717)] hover:bg-[var(--jh-bg-hover,#f5f5f5)]"
          >
            Done
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
