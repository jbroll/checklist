import type { InstanceOfSchema } from 'jazz-tools';
import { Check, Copy, Share2 } from 'lucide-react';
import { useState } from 'react';
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

export function ShareDialog({ open, onOpenChange, folder }: ShareDialogProps) {
  const [recipientEmail, setRecipientEmail] = useState('');
  const [permission, setPermission] = useState<PermissionLevel>('edit');
  const [expiresInDays, setExpiresInDays] = useState(7);
  const [isLoading, setIsLoading] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerateInvite = async () => {
    if (!recipientEmail.trim()) {
      setError('Please enter a recipient email address');
      return;
    }
    setError(null);

    setIsLoading(true);
    try {
      const response = await fetch('http://localhost:3001/api/shares/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // Include cookies for auth
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
      setShareUrl(data.shareUrl);
    } catch (err) {
      console.error('Failed to generate invite:', err);
      setError(err instanceof Error ? err.message : 'Failed to create invite');
    } finally {
      setIsLoading(false);
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

  const handleClose = () => {
    setRecipientEmail('');
    setPermission('edit');
    setExpiresInDays(7);
    setShareUrl(null);
    setCopied(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-5 w-5" />
            Share "{folder.name}"
          </DialogTitle>
          <DialogDescription>Generate a secure invite link to share this folder</DialogDescription>
        </DialogHeader>

        {!shareUrl ? (
          <div className="space-y-4 py-4">
            {/* Email Input */}
            <div className="space-y-2">
              <Label htmlFor="email">Recipient Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="recipient@example.com"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                disabled={isLoading}
              />
            </div>

            {/* Permission Level */}
            <div className="space-y-2">
              <Label htmlFor="permission">Permission Level</Label>
              <select
                id="permission"
                value={permission}
                onChange={(e) => setPermission(e.target.value as PermissionLevel)}
                disabled={isLoading}
                className="flex h-10 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="view">View Only - Can see items</option>
                <option value="edit">Can Edit - Can modify items and sessions</option>
                <option value="admin">Admin - Full control + sharing</option>
              </select>
            </div>

            {/* Expiration */}
            <div className="space-y-2">
              <Label htmlFor="expiration">Expires In</Label>
              <select
                id="expiration"
                value={expiresInDays.toString()}
                onChange={(e) => setExpiresInDays(Number(e.target.value))}
                disabled={isLoading}
                className="flex h-10 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="1">1 day</option>
                <option value="7">7 days</option>
                <option value="30">30 days</option>
                <option value="90">90 days</option>
              </select>
            </div>

            {/* Error Message */}
            {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-900">{error}</div>}

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={handleClose} disabled={isLoading}>
                Cancel
              </Button>
              <Button onClick={handleGenerateInvite} disabled={isLoading}>
                {isLoading ? 'Generating...' : 'Generate Link'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-4">
            {/* Success Message */}
            <div className="rounded-lg bg-green-50 p-4">
              <p className="text-sm font-medium text-green-900">
                Share link generated successfully!
              </p>
              <p className="text-sm text-green-700 mt-1">Send this link to {recipientEmail}</p>
            </div>

            {/* Share URL */}
            <div className="space-y-2">
              <Label>Share Link</Label>
              <div className="flex gap-2">
                <Input value={shareUrl} readOnly className="font-mono text-sm" />
                <Button size="icon" variant="outline" onClick={handleCopyLink} className="shrink-0">
                  {copied ? (
                    <Check className="h-4 w-4 text-green-600" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            {/* Expiration Info */}
            <p className="text-sm text-neutral-500">
              This link expires in {expiresInDays} {expiresInDays === 1 ? 'day' : 'days'}
            </p>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-4">
              <Button onClick={handleClose}>Done</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
