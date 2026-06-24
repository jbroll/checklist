import { type Permission, useSharing } from '@jbr-jazz/hierarchy-client';
import type { InstanceOfSchema } from 'jazz-tools';
import { Check, Contact, Copy, Mail, Share2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { FolderNode } from '@/schema';
import { type Collaborator, type PendingInvite, ShareAccessList } from './ShareAccessList';

interface ShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folder: InstanceOfSchema<typeof FolderNode>;
}

// CSRF header for API requests
const getAuthHeaders = async (): Promise<Record<string, string>> => ({
  'X-Requested-With': 'XMLHttpRequest',
});

export function ShareDialog({ open, onOpenChange, folder }: ShareDialogProps) {
  // Initialize useSharing hook
  const sharing = useSharing({
    apiBaseUrl: '',
    getAuthHeaders,
  });

  // Capability detection (computed at render so it is testable and reflects the
  // actual runtime environment). OS sharing drives the primary action button.
  const hasWebShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const hasContactPicker =
    typeof navigator !== 'undefined' && 'contacts' in navigator && 'ContactsManager' in window;

  // Invite form state
  const [recipientEmail, setRecipientEmail] = useState('');
  const [permission, setPermission] = useState<Permission>('writer');
  const [expiresInDays, setExpiresInDays] = useState(7);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCreatingInvite, setIsCreatingInvite] = useState(false);
  const [emailSentTo, setEmailSentTo] = useState<string | null>(null);

  // Access management state
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);

  // biome-ignore lint/correctness/useExhaustiveDependencies: sharing methods are stable via useCallback
  const loadAccessData = useCallback(async () => {
    setIsLoadingData(true);
    setError(null);

    try {
      const [collabs, invites] = await Promise.all([
        sharing.getCollaborators(folder.$jazz.id),
        sharing.getPendingInvites(folder.$jazz.id),
      ]);

      setCollaborators(collabs as Collaborator[]);
      setPendingInvites(invites as unknown as PendingInvite[]);
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

  // Validation: Check if recipient input is valid email
  const isRecipientValid = () => {
    const trimmed = recipientEmail.trim();
    if (!trimmed) return false;

    // RFC-compliant email regex
    const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    const MAX_EMAIL_LENGTH = 254;

    if (trimmed.length > MAX_EMAIL_LENGTH) return false;

    // Check email pattern
    if (EMAIL_REGEX.test(trimmed)) return true;

    // Also allow phone pattern (starts with + or digit, has at least 10 digits)
    const phoneDigits = trimmed.replace(/\D/g, '');
    return phoneDigits.length >= 10;
  };

  // Create the invite (and grant the sharing agent admin) for the current
  // recipient, returning the share URL. `sendEmail` controls whether the backend
  // emails the recipient — only the Email Invite action passes true.
  const createForChannel = async (sendEmail: boolean): Promise<string | null> => {
    setError(null);
    setIsCreatingInvite(true);
    try {
      const result = await sharing.createInviteAndGrantAgent(
        folder,
        recipientEmail.trim(),
        permission,
        undefined,
        sendEmail,
      );
      setShareUrl(result.shareUrl);
      loadAccessData();
      return result.shareUrl;
    } catch (err) {
      console.error('Failed to create invite:', err);
      setError(err instanceof Error ? err.message : 'Failed to create invite');
      return null;
    } finally {
      setIsCreatingInvite(false);
    }
  };

  const handleCopy = async () => {
    const url = await createForChannel(false);
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy link to clipboard');
    }
  };

  const handleShare = async () => {
    const url = await createForChannel(false);
    if (!url) return;
    try {
      await navigator.share({
        title: `Join ${folder.name}`,
        text: `You've been invited to collaborate on "${folder.name}"`,
        url,
      });
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.error('Share failed:', err);
        setError('Failed to share link');
      }
    }
  };

  const handleEmailInvite = async () => {
    const recipient = recipientEmail.trim();
    const url = await createForChannel(true);
    if (!url) return;
    setEmailSentTo(recipient);
  };

  const handleRemoveCollaborator = async (accountId: string) => {
    if (!confirm('Remove this collaborator? They will lose access to this folder.')) {
      return;
    }

    try {
      const success = await sharing.removeCollaborator(folder.$jazz.id, accountId);

      if (success) {
        loadAccessData();
      } else {
        setError(sharing.error?.message || 'Failed to remove collaborator');
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
      const success = await sharing.revokeInvite(token);

      if (success) {
        loadAccessData();
        // Clear shareUrl if it matches the revoked invite
        if (shareUrl?.includes(token)) {
          setShareUrl(null);
        }
      } else {
        setError(sharing.error?.message || 'Failed to revoke invite');
      }
    } catch (_err) {
      setError('Failed to revoke invite');
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
    } catch {
      // User cancelled or error occurred - expected behavior
    }
  };

  const handleClose = () => {
    setRecipientEmail('');
    setPermission('writer');
    setExpiresInDays(7);
    setShareUrl(null);
    setEmailSentTo(null);
    setCopied(false);
    setError(null);
    setIsCreatingInvite(false);
    onOpenChange(false);
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
                  maxLength={254}
                  type="text"
                  placeholder="colleague@example.com or +1234567890"
                  value={recipientEmail}
                  onChange={(e) => {
                    setRecipientEmail(e.target.value);
                    setShareUrl(null);
                    setEmailSentTo(null);
                  }}
                  disabled={isCreatingInvite}
                  className="flex-1"
                />
                {hasContactPicker && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleContactPicker}
                    disabled={isCreatingInvite}
                    title="Pick from contacts"
                    className="shrink-0"
                  >
                    <Contact className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 items-end">
              <div className="space-y-2">
                <Label htmlFor="permission">Permission</Label>
                <select
                  id="permission"
                  value={permission}
                  onChange={(e) => {
                    setPermission(e.target.value as Permission);
                    setShareUrl(null);
                    setEmailSentTo(null);
                  }}
                  disabled={isCreatingInvite}
                  className="flex h-10 w-full rounded-md border border-divider-primary bg-surface-primary px-3 py-2 text-sm text-content-primary focus:outline-none focus:ring-2 focus:ring-green-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="reader">Reader</option>
                  <option value="writer">Writer</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="expiration">Expires</Label>
                <select
                  id="expiration"
                  value={expiresInDays.toString()}
                  onChange={(e) => {
                    setExpiresInDays(Number(e.target.value));
                    setShareUrl(null);
                    setEmailSentTo(null);
                  }}
                  disabled={isCreatingInvite}
                  className="flex h-10 w-full rounded-md border border-divider-primary bg-surface-primary px-3 py-2 text-sm text-content-primary focus:outline-none focus:ring-2 focus:ring-green-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="1">1 day</option>
                  <option value="7">7 days</option>
                  <option value="30">30 days</option>
                  <option value="90">90 days</option>
                </select>
              </div>
            </div>

            {/* Delivery actions: always visible (discoverable), disabled until a
                valid recipient is entered. The primary button is OS-share when
                available, otherwise Email Invite. */}
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                onClick={handleCopy}
                disabled={isCreatingInvite || !isRecipientValid()}
                className="h-10"
              >
                {copied ? (
                  <Check className="h-4 w-4 mr-2 text-green-600" />
                ) : (
                  <Copy className="h-4 w-4 mr-2" />
                )}
                Copy link
              </Button>

              {hasWebShare ? (
                <Button
                  onClick={handleShare}
                  disabled={isCreatingInvite || !isRecipientValid()}
                  className="h-10"
                >
                  <Share2 className="h-4 w-4 mr-2" />
                  Share
                </Button>
              ) : (
                <Button
                  onClick={handleEmailInvite}
                  disabled={isCreatingInvite || !isRecipientValid()}
                  className="h-10"
                >
                  <Mail className="h-4 w-4 mr-2" />
                  Email invite
                </Button>
              )}
            </div>

            {shareUrl && (
              <div className="rounded-lg bg-green-50 dark:bg-green-900/20 p-3 space-y-2">
                <p className="text-sm font-medium text-green-900 dark:text-green-300">
                  {emailSentTo ? `Invite emailed to ${emailSentTo}` : 'Invite link ready'}
                </p>
                <Input value={shareUrl} readOnly className="font-mono text-xs bg-surface-primary" />
              </div>
            )}
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-900 dark:text-red-300">
              {error}
            </div>
          )}

          <ShareAccessList
            collaborators={collaborators}
            pendingInvites={pendingInvites}
            isLoading={isLoadingData}
            onRemoveCollaborator={handleRemoveCollaborator}
            onRevokeInvite={handleRevokeInvite}
            onError={setError}
          />
        </div>

        <div className="flex justify-end pt-4 border-t">
          <Button onClick={handleClose}>Done</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
