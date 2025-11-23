import { Account, type ID, type InstanceOfSchema } from 'jazz-tools';
import { Check, Clock, Copy, Loader2, Mail, Share2, Trash2, Users, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { FolderNode } from '@/schemas';

interface ShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folder: InstanceOfSchema<typeof FolderNode>;
}

type PermissionLevel = 'view' | 'edit' | 'admin';

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

export function ShareDialog({ open, onOpenChange, folder }: ShareDialogProps) {
  // Invite form state
  const [recipientEmail, setRecipientEmail] = useState('');
  const [permission, setPermission] = useState<PermissionLevel>('edit');
  const [expiresInDays, setExpiresInDays] = useState(7);
  const [isGenerating, setIsGenerating] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Access management state
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);

  const loadAccessData = useCallback(async () => {
    setIsLoadingData(true);
    setError(null);

    try {
      // Load collaborators
      const collabResponse = await fetch(`/api/shares/folders/${folder.$jazz.id}/collaborators`, {
        credentials: 'include',
      });

      if (collabResponse.ok) {
        const collabData = await collabResponse.json();
        setCollaborators(collabData.collaborators || []);
      }

      // Load pending invites
      const invitesResponse = await fetch(`/api/shares/folders/${folder.$jazz.id}/invites`, {
        credentials: 'include',
      });

      if (invitesResponse.ok) {
        const invitesData = await invitesResponse.json();
        setPendingInvites(invitesData.invites || []);
      }
    } catch (_err) {
      console.error('Failed to load access data:', _err);
      setError('Failed to load collaborators');
    } finally {
      setIsLoadingData(false);
    }
  }, [folder.$jazz.id]);

  useEffect(() => {
    if (open) {
      loadAccessData();
    }
  }, [open, loadAccessData]);

  const handleGenerateInvite = async () => {
    if (!recipientEmail.trim()) {
      setError('Please enter a recipient email address');
      return;
    }
    setError(null);

    setIsGenerating(true);
    try {
      const response = await fetch('/api/shares/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          recipientEmail: recipientEmail.trim(),
          folderCoValueId: folder.$jazz.id,
          permission,
          expiresInDays,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to generate invite');
      }

      const data = await response.json();

      // Add the agent to the folder so it can manage future accepts
      if (data.agentAccountId) {
        try {
          const agentAccount = await Account.load(data.agentAccountId as ID<Account>, {
            loadAs: folder.$jazz.owner,
          });

          if (agentAccount) {
            // Check if agent is already a member
            const isMember = folder.$jazz.owner.members.some(
              (m: { id: string }) => m.id === data.agentAccountId,
            );

            if (!isMember) {
              folder.$jazz.owner.addMember(agentAccount, 'admin');
              console.log('Added agent to folder for invite management');
            }
          }
        } catch (err) {
          console.error('Failed to add agent to folder:', err);
          // Continue anyway - this is not critical for the invite creation
        }
      }

      setShareUrl(data.shareUrl);
      setRecipientEmail('');
      // Refresh the pending invites list
      loadAccessData();
    } catch (err) {
      console.error('Failed to generate invite:', err);
      setError(err instanceof Error ? err.message : 'Failed to create invite');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyLink = async () => {
    if (!shareUrl) return;

    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (_err) {
      setError('Could not copy link to clipboard');
    }
  };

  const handleRemoveCollaborator = async (accountId: string) => {
    if (!confirm('Remove this collaborator? They will lose access to this folder.')) {
      return;
    }

    try {
      const response = await fetch(
        `/api/shares/folders/${folder.$jazz.id}/collaborators/${accountId}`,
        {
          method: 'DELETE',
          credentials: 'include',
        },
      );

      if (response.ok) {
        loadAccessData();
      } else {
        const error = await response.json();
        setError(error.message || 'Failed to remove collaborator');
      }
    } catch (_err) {
      setError('Failed to remove collaborator');
    }
  };

  const handleRevokeInvite = async (token: string, recipientEmail: string) => {
    if (
      !confirm(`Revoke invite for ${recipientEmail}? They will no longer be able to use this link.`)
    ) {
      return;
    }

    try {
      const response = await fetch(`/api/shares/invites/${token}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (response.ok) {
        loadAccessData();
        // Clear shareUrl if it matches the revoked invite
        if (shareUrl?.includes(token)) {
          setShareUrl(null);
        }
      } else {
        const error = await response.json();
        setError(error.message || 'Failed to revoke invite');
      }
    } catch (_err) {
      setError('Failed to revoke invite');
    }
  };

  const handleCopyInviteLink = async (token: string) => {
    const inviteUrl = `${window.location.origin}/invite/${token}`;

    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopiedToken(token);

      // Reset copied state after 2 seconds
      setTimeout(() => {
        setCopiedToken(null);
      }, 2000);
    } catch (_err) {
      setError('Failed to copy invite link');
    }
  };

  const handleClose = () => {
    setRecipientEmail('');
    setPermission('edit');
    setExpiresInDays(7);
    setShareUrl(null);
    setCopied(false);
    setError(null);
    onOpenChange(false);
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
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-5 w-5" />
            Share "{folder.name}"
          </DialogTitle>
          <DialogDescription>
            Invite people to collaborate or manage existing access
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-6 py-4">
          {/* Invite Form */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-neutral-900">Invite New Collaborator</h3>

            {shareUrl && (
              <div className="rounded-lg bg-green-50 p-3 space-y-2">
                <p className="text-sm font-medium text-green-900">Link generated!</p>
                <div className="flex gap-2">
                  <Input value={shareUrl} readOnly className="font-mono text-xs bg-white" />
                  <Button size="sm" variant="outline" onClick={handleCopyLink}>
                    {copied ? (
                      <Check className="h-4 w-4 text-green-600" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Recipient Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="recipient@example.com"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                disabled={isGenerating}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="permission">Permission</Label>
                <select
                  id="permission"
                  value={permission}
                  onChange={(e) => setPermission(e.target.value as PermissionLevel)}
                  disabled={isGenerating}
                  className="flex h-10 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="view">View</option>
                  <option value="edit">Edit</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="expiration">Expires</Label>
                <select
                  id="expiration"
                  value={expiresInDays.toString()}
                  onChange={(e) => setExpiresInDays(Number(e.target.value))}
                  disabled={isGenerating}
                  className="flex h-10 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="1">1 day</option>
                  <option value="7">7 days</option>
                  <option value="30">30 days</option>
                  <option value="90">90 days</option>
                </select>
              </div>
            </div>

            <Button onClick={handleGenerateInvite} disabled={isGenerating} className="w-full">
              {isGenerating ? 'Generating...' : 'Generate Invite Link'}
            </Button>
          </div>

          {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-900">{error}</div>}

          {isLoadingData ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-green-600" />
            </div>
          ) : (
            <>
              {/* Current Collaborators */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-neutral-900 flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Collaborators ({collaborators.length})
                </h3>

                {collaborators.length === 0 ? (
                  <p className="text-sm text-neutral-500 py-4 text-center">No collaborators yet</p>
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

              {/* Pending Invites */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-neutral-900 flex items-center gap-2">
                  <Mail className="h-4 w-4" />
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
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleCopyInviteLink(invite.token)}
                            className="text-green-600 hover:text-green-700 hover:bg-green-50"
                            title="Copy invite link"
                          >
                            {copiedToken === invite.token ? (
                              <Check className="h-4 w-4" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleRevokeInvite(invite.token, invite.recipientEmail)}
                            className="text-neutral-600 hover:text-red-700 hover:bg-red-50"
                            title="Revoke invite"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end pt-4 border-t">
          <Button onClick={handleClose}>Done</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
