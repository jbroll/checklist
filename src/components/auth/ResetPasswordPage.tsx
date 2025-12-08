import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { betterAuthClient } from '@/lib/auth-client';

export function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Get token from URL query params
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get('token');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    if (!token) {
      setError('Invalid or missing reset token');
      return;
    }

    setIsLoading(true);

    try {
      const result = await betterAuthClient.resetPassword({
        newPassword: password,
        token,
      });

      if (result.error) {
        setError(result.error.message || 'Failed to reset password');
      } else {
        setSuccess(true);
      }
    } catch {
      setError('Failed to reset password. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-secondary px-4">
        <div className="w-full max-w-md rounded-lg border bg-white p-8 shadow-lg">
          <h1 className="mb-4 text-2xl font-bold text-neutral-900">Invalid Link</h1>
          <p className="mb-6 text-neutral-600">
            This password reset link is invalid or has expired.
          </p>
          <a
            href="/"
            className="inline-block rounded-lg bg-green-600 px-4 py-2 text-white hover:bg-green-700"
          >
            Go to Home
          </a>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-secondary px-4">
        <div className="w-full max-w-md rounded-lg border bg-white p-8 shadow-lg">
          <h1 className="mb-4 text-2xl font-bold text-neutral-900">Password Reset</h1>
          <p className="mb-6 text-neutral-600">
            Your password has been reset successfully. You can now sign in with your new password.
          </p>
          <a
            href="/"
            className="inline-block rounded-lg bg-green-600 px-4 py-2 text-white hover:bg-green-700"
          >
            Go to Sign In
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-secondary px-4">
      <div className="w-full max-w-md rounded-lg border bg-white p-8 shadow-lg">
        <h1 className="mb-2 text-2xl font-bold text-neutral-900">Reset Password</h1>
        <p className="mb-6 text-neutral-600">Enter your new password below.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password">New Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm Password</Label>
            <Input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm your password"
              required
              autoComplete="new-password"
            />
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? 'Resetting...' : 'Reset Password'}
          </Button>
        </form>

        <div className="mt-6 text-center">
          <a href="/" className="text-sm text-muted-foreground hover:text-foreground">
            Back to Sign In
          </a>
        </div>
      </div>
    </div>
  );
}
