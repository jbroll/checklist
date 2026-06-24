import { Check, Clock, Copy, Loader2, Mail, Trash2, Users, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

export interface Collaborator {
  userId: string;
  accountId: string;
  email: string;
  name: string;
  permission: 'reader' | 'writer' | 'admin';
  role: string;
}

export interface PendingInvite {
  token: string;
  recipientEmail: string;
  permission: string;
  createdAt: string;
  expiresAt: string | null;
}

interface ShareAccessListProps {
  collaborators: Collaborator[];
  pendingInvites: PendingInvite[];
  isLoading: boolean;
  onRemoveCollaborator: (accountId: string) => void;
  onRevokeInvite: (token: string, recipientEmail: string) => void;
  onError: (message: string) => void;
}

function getPermissionBadge(permission: string) {
  const colors = {
    reader: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
    writer: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
    admin: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
  };

  const labels = {
    reader: 'Reader',
    writer: 'Writer',
    admin: 'Admin',
  };

  return (
    <span
      className={`px-2 py-1 text-xs font-medium rounded ${colors[permission as keyof typeof colors] || 'bg-surface-tertiary text-content-secondary'}`}
    >
      {labels[permission as keyof typeof labels] || permission}
    </span>
  );
}

function formatDate(isoString: string) {
  const date = new Date(isoString);
  const now = new Date();
  const diff = date.getTime() - now.getTime();
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));

  if (days < 0) return 'Expired';
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `${days} days`;
}

/**
 * Read-only management of who currently has access: existing collaborators and
 * outstanding pending invites. Mutations are delegated to the parent via
 * callbacks; this component owns only the transient "copied" state.
 */
export function ShareAccessList({
  collaborators,
  pendingInvites,
  isLoading,
  onRemoveCollaborator,
  onRevokeInvite,
  onError,
}: ShareAccessListProps) {
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const handleCopyInviteLink = async (token: string) => {
    const inviteUrl = `${window.location.origin}/invite/${token}`;

    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopiedToken(token);
      setTimeout(() => {
        setCopiedToken(null);
      }, 2000);
    } catch {
      onError('Failed to copy invite link');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-green-600" />
      </div>
    );
  }

  return (
    <>
      {/* Current Collaborators */}
      <div className="space-y-1.5">
        <h3 className="text-xs font-medium text-content-tertiary flex items-center gap-1.5 px-1">
          <Users className="h-3.5 w-3.5" />
          Collaborators ({collaborators.length})
        </h3>

        {collaborators.length === 0 ? (
          <p className="text-sm text-content-tertiary py-3 text-center">No collaborators yet</p>
        ) : (
          <div className="space-y-1">
            {collaborators.map((collab) => (
              <div
                key={collab.accountId}
                className="flex items-center justify-between gap-2 py-1.5 px-2 border border-divider-primary rounded hover:bg-interactive-hover"
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span className="text-sm font-medium text-content-primary truncate">
                    {collab.name}
                  </span>
                  <span className="text-xs text-content-tertiary truncate">({collab.email})</span>
                  {getPermissionBadge(collab.permission)}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onRemoveCollaborator(collab.accountId)}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50 h-7 w-7 p-0 shrink-0"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pending Invites */}
      <div className="space-y-1.5">
        <h3 className="text-xs font-medium text-content-tertiary flex items-center gap-1.5 px-1">
          <Mail className="h-3.5 w-3.5" />
          Pending Invites ({pendingInvites.length})
        </h3>

        {pendingInvites.length === 0 ? (
          <p className="text-sm text-content-tertiary py-3 text-center">No pending invites</p>
        ) : (
          <div className="space-y-1">
            {pendingInvites.map((invite) => (
              <div
                key={invite.token}
                className="flex items-center justify-between gap-2 py-1.5 px-2 border border-yellow-200 dark:border-yellow-700 bg-yellow-50 dark:bg-yellow-900/20 rounded"
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span className="text-sm font-medium text-content-primary truncate">
                    {invite.recipientEmail}
                  </span>
                  {getPermissionBadge(invite.permission)}
                  <span className="text-xs text-content-tertiary flex items-center gap-1 shrink-0">
                    <Clock className="h-3 w-3" />
                    Expires {invite.expiresAt ? formatDate(invite.expiresAt) : 'never'}
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleCopyInviteLink(invite.token)}
                    className="text-green-600 hover:text-green-700 hover:bg-green-50 h-7 w-7 p-0"
                    title="Copy invite link"
                  >
                    {copiedToken === invite.token ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onRevokeInvite(invite.token, invite.recipientEmail)}
                    className="text-content-secondary hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/30 h-7 w-7 p-0"
                    title="Revoke invite"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
