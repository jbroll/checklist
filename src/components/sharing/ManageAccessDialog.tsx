import type { InstanceOfSchema } from 'jazz-tools';
import { Clock, Loader2, Mail, Trash2, Users, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { FolderNode } from '@/schemas';

interface ManageAccessDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folder: InstanceOfSchema<typeof FolderNode>;
}

interface Collaborator {
  userId: string;
  accountId: string;
  email: string;
  name: string;
  permission: 'view' | 'edit' | 'admin';
  role: string;
}

interface PendingInvite {
  token: string;
  recipientEmail: string;
  permission: string;
  createdAt: string;
  expiresAt: string | null;
}

export function ManageAccessDialog({ open, onOpenChange, folder }: ManageAccessDialogProps) {
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Load collaborators
      const collabResponse = await fetch(
        `http://localhost:3001/api/shares/folders/${folder.$jazz.id}/collaborators`,
        { credentials: 'include' },
      );

      if (collabResponse.ok) {
        const collabData = await collabResponse.json();
        setCollaborators(collabData.collaborators || []);
      }

      // Load pending invites
      const invitesResponse = await fetch(
        `http://localhost:3001/api/shares/folders/${folder.$jazz.id}/invites`,
        { credentials: 'include' },
      );

      if (invitesResponse.ok) {
        const invitesData = await invitesResponse.json();
        setPendingInvites(invitesData.invites || []);
      }
    } catch (_err) {
      console.error('Failed to load access data:', _err);
      setError('Failed to load collaborators');
    } finally {
      setIsLoading(false);
    }
  }, [folder.$jazz.id]);

  useEffect(() => {
    if (open) {
      loadData();
    }
  }, [open, loadData]);

  const handleRemoveCollaborator = async (accountId: string) => {
    if (!confirm('Remove this collaborator? They will lose access to this folder.')) {
      return;
    }

    try {
      const response = await fetch(
        `http://localhost:3001/api/shares/folders/${folder.$jazz.id}/collaborators/${accountId}`,
        {
          method: 'DELETE',
          credentials: 'include',
        },
      );

      if (response.ok) {
        // Refresh data
        loadData();
      } else {
        const error = await response.json();
        setError(error.message || 'Failed to remove collaborator');
      }
    } catch (_err) {
      setError('Failed to remove collaborator');
    }
  };

  const handleRevokeInvite = async (token: string) => {
    try {
      const response = await fetch(`http://localhost:3001/api/shares/invites/${token}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (response.ok) {
        // Refresh data
        loadData();
      } else {
        const error = await response.json();
        setError(error.message || 'Failed to revoke invite');
      }
    } catch (_err) {
      setError('Failed to revoke invite');
    }
  };

  const getPermissionBadge = (permission: string) => {
    const colors = {
      view: 'bg-blue-100 text-blue-700',
      edit: 'bg-green-100 text-green-700',
      admin: 'bg-purple-100 text-purple-700',
    };

    const labels = {
      view: 'View',
      edit: 'Edit',
      admin: 'Admin',
    };

    return (
      <span
        className={`px-2 py-1 text-xs font-medium rounded ${colors[permission as keyof typeof colors] || 'bg-neutral-100 text-neutral-700'}`}
      >
        {labels[permission as keyof typeof labels] || permission}
      </span>
    );
  };

  const formatDate = (isoString: string) => {
    const date = new Date(isoString);
    const now = new Date();
    const diff = date.getTime() - now.getTime();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));

    if (days < 0) return 'Expired';
    if (days === 0) return 'Today';
    if (days === 1) return 'Tomorrow';
    return `${days} days`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Manage Access - "{folder.name}"
          </DialogTitle>
          <DialogDescription>View and manage who has access to this folder</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-6 py-4">
          {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-900">{error}</div>}

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-green-600" />
            </div>
          ) : (
            <>
              {/* Collaborators Section */}
              <div>
                <h3 className="text-sm font-semibold text-neutral-900 mb-3">
                  Collaborators ({collaborators.length})
                </h3>

                {collaborators.length === 0 ? (
                  <p className="text-sm text-neutral-500 py-4 text-center">
                    No collaborators yet. Share this folder to add people.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {collaborators.map((collab) => (
                      <div
                        key={collab.accountId}
                        className="flex items-center justify-between p-3 border border-neutral-200 rounded-lg hover:bg-neutral-50"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-neutral-900 truncate">
                              {collab.name}
                            </p>
                            {getPermissionBadge(collab.permission)}
                          </div>
                          <p className="text-xs text-neutral-500 truncate">{collab.email}</p>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleRemoveCollaborator(collab.accountId)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Pending Invites Section */}
              <div>
                <h3 className="text-sm font-semibold text-neutral-900 mb-3">
                  Pending Invites ({pendingInvites.length})
                </h3>

                {pendingInvites.length === 0 ? (
                  <p className="text-sm text-neutral-500 py-4 text-center">No pending invites</p>
                ) : (
                  <div className="space-y-2">
                    {pendingInvites.map((invite) => (
                      <div
                        key={invite.token}
                        className="flex items-center justify-between p-3 border border-yellow-200 bg-yellow-50 rounded-lg"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <Mail className="h-4 w-4 text-yellow-700 shrink-0" />
                            <p className="text-sm font-medium text-neutral-900 truncate">
                              {invite.recipientEmail}
                            </p>
                            {getPermissionBadge(invite.permission)}
                          </div>
                          <div className="flex items-center gap-1 mt-1">
                            <Clock className="h-3 w-3 text-neutral-500" />
                            <p className="text-xs text-neutral-500">
                              Expires {invite.expiresAt ? formatDate(invite.expiresAt) : 'never'}
                            </p>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleRevokeInvite(invite.token)}
                          className="text-neutral-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end pt-4 border-t">
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
