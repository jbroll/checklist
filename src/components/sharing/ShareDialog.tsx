import { Account, type ID, type InstanceOfSchema } from 'jazz-tools';
import { Check, Clock, Contact, Copy, Loader2, Mail, Share2, Trash2, Users, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { FolderNode } from '@/schemas';

// Check if Contact Picker API is available
const hasContactPicker = 'contacts' in navigator && 'ContactsManager' in window;

// Check if Web Share API is available
const hasWebShare = 'share' in navigator;

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

  // Validation: Check if recipient input is valid (basic email or phone number pattern)
  const isRecipientValid = () => {
    const trimmed = recipientEmail.trim();
    if (!trimmed) return false;

    // Simple email pattern (contains @ and .)
    const hasEmailPattern = trimmed.includes('@') && trimmed.includes('.');

    // Simple phone pattern (starts with + or digit, has at least 10 digits)
    const phoneDigits = trimmed.replace(/\D/g, '');
    const hasPhonePattern = phoneDigits.length >= 10;

    return hasEmailPattern || hasPhonePattern;
  };

  const handleGenerateInvite = async () => {
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
        console.log(`Attempting to add agent ${data.agentAccountId} to folder ${folder.$jazz.id}`);
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
              await folder.$jazz.owner.$jazz.waitForSync();
              console.log('✅ Successfully added agent to folder for invite management');
            } else {
              console.log('Agent is already a member of this folder');
            }
          } else {
            console.error('⚠️ Could not load agent account');
          }
        } catch (err) {
          console.error('❌ Failed to add agent to folder:', err);
          setError(
            'Warning: Could not add sharing agent to folder. Invite link created but accepting may fail. Try refreshing and creating a new invite.',
          );
        }
      } else {
        console.error('⚠️ No agent account ID returned from backend');
        setError('Warning: No sharing agent configured. Invite accepting may not work.');
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

  const handleContactPicker = async () => {
    if (!hasContactPicker) return;

    try {
      // @ts-expect-error - Contact Picker API not in TS types yet
      const contacts = await navigator.contacts.select(['email'], { multiple: false });

      if (contacts && contacts.length > 0) {
        const contact = contacts[0];
        if (contact.email && contact.email.length > 0) {
          setRecipientEmail(contact.email[0]);
        }
      }
    } catch (err) {
      // User cancelled or error occurred
      console.log('Contact picker cancelled or error:', err);
    }
  };

  const handleWebShare = async () => {
    if (!hasWebShare || !shareUrl) return;

    try {
      await navigator.share({
        title: `Join ${folder.name}`,
        text: `You've been invited to collaborate on "${folder.name}"`,
        url: shareUrl,
      });
    } catch (err) {
      // User cancelled or error occurred
      if ((err as Error).name !== 'AbortError') {
        console.error('Share failed:', err);
        setError('Failed to share link');
      }
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
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-6 py-4">
          {/* Invite Form */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Share with a collaborator by email or phone number</Label>
              <div className="flex gap-2">
                <Input
                  id="email"
                  type="text"
                  placeholder="colleague@example.com or +1234567890"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  disabled={isGenerating}
                  className="flex-1"
                />
                {hasContactPicker && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleContactPicker}
                    disabled={isGenerating}
                    title="Pick from contacts"
                    className="shrink-0"
                  >
                    <Contact className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-[1fr_1fr_auto] gap-3 items-end">
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

              <Button
                onClick={handleGenerateInvite}
                disabled={isGenerating || !isRecipientValid()}
                className="h-10"
              >
                {isGenerating ? 'Getting...' : 'Get Link'}
              </Button>
            </div>

            {shareUrl && (
              <div className="rounded-lg bg-green-50 p-3 space-y-2">
                <p className="text-sm font-medium text-green-900">Invite link generated!</p>
                <div className="flex gap-2">
                  <Input value={shareUrl} readOnly className="font-mono text-xs bg-white flex-1" />
                  <Button size="sm" variant="outline" onClick={handleCopyLink} title="Copy link">
                    {copied ? (
                      <Check className="h-4 w-4 text-green-600" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                  {hasWebShare && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleWebShare}
                      title="Share via..."
                    >
                      <Share2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>

          {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-900">{error}</div>}

          {isLoadingData ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-green-600" />
            </div>
          ) : (
            <>
              {/* Current Collaborators */}
              <div className="space-y-1.5">
                <h3 className="text-xs font-medium text-neutral-500 flex items-center gap-1.5 px-1">
                  <Users className="h-3.5 w-3.5" />
                  Collaborators ({collaborators.length})
                </h3>

                {collaborators.length === 0 ? (
                  <p className="text-sm text-neutral-500 py-3 text-center">No collaborators yet</p>
                ) : (
                  <div className="space-y-1">
                    {collaborators.map((collab) => (
                      <div
                        key={collab.accountId}
                        className="flex items-center justify-between gap-2 py-1.5 px-2 border border-neutral-200 rounded hover:bg-neutral-50"
                      >
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <span className="text-sm font-medium text-neutral-900 truncate">
                            {collab.name}
                          </span>
                          <span className="text-xs text-neutral-500 truncate">
                            ({collab.email})
                          </span>
                          {getPermissionBadge(collab.permission)}
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleRemoveCollaborator(collab.accountId)}
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
                <h3 className="text-xs font-medium text-neutral-500 flex items-center gap-1.5 px-1">
                  <Mail className="h-3.5 w-3.5" />
                  Pending Invites ({pendingInvites.length})
                </h3>

                {pendingInvites.length === 0 ? (
                  <p className="text-sm text-neutral-500 py-3 text-center">No pending invites</p>
                ) : (
                  <div className="space-y-1">
                    {pendingInvites.map((invite) => (
                      <div
                        key={invite.token}
                        className="flex items-center justify-between gap-2 py-1.5 px-2 border border-yellow-200 bg-yellow-50 rounded"
                      >
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <span className="text-sm font-medium text-neutral-900 truncate">
                            {invite.recipientEmail}
                          </span>
                          {getPermissionBadge(invite.permission)}
                          <span className="text-xs text-neutral-500 flex items-center gap-1 shrink-0">
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
                            onClick={() => handleRevokeInvite(invite.token, invite.recipientEmail)}
                            className="text-neutral-600 hover:text-red-700 hover:bg-red-50 h-7 w-7 p-0"
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
          )}
        </div>

        <div className="flex justify-end pt-4 border-t">
          <Button onClick={handleClose}>Done</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
