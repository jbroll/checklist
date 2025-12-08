import { Loader2, Mail, Plus, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { betterAuthClient } from '@/lib/auth-client';

interface VerifiedEmail {
  id: string;
  email: string;
  verifiedAt: string;
}

export function LinkedEmailsSection() {
  const [primaryEmail, setPrimaryEmail] = useState<string | null>(null);
  const [verifiedEmails, setVerifiedEmails] = useState<VerifiedEmail[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      // Get primary email from session
      const session = await betterAuthClient.getSession();
      if (session?.data?.user?.email) {
        setPrimaryEmail(session.data.user.email);
      }

      // Get verified emails
      const verifiedResponse = await fetch('/api/verified-emails', {
        credentials: 'include',
      });
      if (verifiedResponse.ok) {
        const data = await verifiedResponse.json();
        setVerifiedEmails(data.emails || []);
      }
    } catch {
      // Silently ignore fetch errors
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAddEmail = async () => {
    if (!newEmail.trim()) return;

    setError(null);
    setSuccessMessage(null);
    setIsAdding(true);

    try {
      const response = await fetch('/api/verified-emails/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: newEmail.trim() }),
      });

      const data = await response.json();

      if (response.ok) {
        setSuccessMessage(`Verification email sent to ${newEmail}`);
        setNewEmail('');
      } else {
        setError(data.error || 'Failed to send verification email');
      }
    } catch (_err) {
      setError('Network error. Please try again.');
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemoveEmail = async (id: string) => {
    setDeletingId(id);
    setError(null);

    try {
      const response = await fetch(`/api/verified-emails/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (response.ok) {
        setVerifiedEmails((prev) => prev.filter((e) => e.id !== id));
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to remove email');
      }
    } catch (_err) {
      setError('Network error. Please try again.');
    } finally {
      setDeletingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-5 w-5 animate-spin text-content-secondary" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="text-sm font-medium text-content-primary">Linked Emails</div>
      <p className="text-xs text-content-secondary">
        Add additional email addresses to receive shares sent to those addresses.
      </p>

      {/* Error/Success messages */}
      {error && (
        <div className="flex items-center gap-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
          <X className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}
      {successMessage && (
        <div className="flex items-center gap-2 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-400">
          <Mail className="h-4 w-4 flex-shrink-0" />
          {successMessage}
        </div>
      )}

      {/* Primary email */}
      <div className="flex items-center gap-2 rounded-md border border-border-default bg-surface-secondary px-3 py-2">
        <Mail className="h-4 w-4 text-content-secondary" />
        <span className="flex-1 text-sm">{primaryEmail}</span>
        <span className="text-xs text-content-tertiary">Primary</span>
      </div>

      {/* Verified emails */}
      {verifiedEmails.map((email) => (
        <div
          key={email.id}
          className="flex items-center gap-2 rounded-md border border-border-default bg-surface-primary px-3 py-2"
        >
          <Mail className="h-4 w-4 text-content-secondary" />
          <span className="flex-1 text-sm">{email.email}</span>
          <button
            type="button"
            onClick={() => handleRemoveEmail(email.id)}
            disabled={deletingId === email.id}
            className="rounded p-1 text-content-tertiary hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-900/20"
            title="Remove email"
          >
            {deletingId === email.id ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </button>
        </div>
      ))}

      {/* Add new email */}
      <div className="flex gap-2">
        <input
          type="email"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          placeholder="Add email address"
          className="flex-1 rounded-md border border-border-default bg-surface-primary px-3 py-2 text-sm placeholder:text-content-tertiary focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleAddEmail();
            }
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAddEmail}
          disabled={isAdding || !newEmail.trim()}
          className="gap-1"
        >
          {isAdding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Add
        </Button>
      </div>
    </div>
  );
}
