import { ArrowLeft } from 'lucide-react';
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
import { betterAuthClient } from '@/lib/auth-client';

interface EmailAuthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type AuthMode = 'signin' | 'signup' | 'forgot-password' | 'resend-verification' | 'check-email';

export function EmailAuthDialog({ open, onOpenChange }: EmailAuthDialogProps) {
  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showResendVerification, setShowResendVerification] = useState(false);

  const resetForm = () => {
    setEmail('');
    setPassword('');
    setName('');
    setError(null);
    setMessage(null);
    setShowResendVerification(false);
  };

  const handleModeChange = (newMode: AuthMode) => {
    setMode(newMode);
    setError(null);
    setMessage(null);
    setShowResendVerification(false);
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      resetForm();
      setMode('signin');
    }
    onOpenChange(isOpen);
  };

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const result = await betterAuthClient.signIn.email({
        email,
        password,
      });

      if (result.error) {
        // Check for "verify", "verified", "verification" etc.
        if (result.error.message?.toLowerCase().includes('verif')) {
          setError('Please verify your email first.');
          setShowResendVerification(true);
        } else {
          setError(result.error.message || 'Invalid email or password');
          setShowResendVerification(false);
        }
      } else {
        onOpenChange(false);
        resetForm();
        window.location.reload();
      }
    } catch {
      setError('Sign in failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmailSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const result = await betterAuthClient.signUp.email({
        email,
        password,
        name: name || email.split('@')[0],
        callbackURL: `${window.location.origin}?verified=true`,
      });

      if (result.error) {
        setError(result.error.message || 'Sign up failed');
      } else {
        setMode('check-email');
        setMessage('Check your email to verify your account.');
      }
    } catch {
      setError('Sign up failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      await betterAuthClient.forgetPassword({
        email,
        redirectTo: `${window.location.origin}/reset-password`,
      });
      setMode('check-email');
      setMessage('Check your email for a password reset link.');
    } catch {
      setError('Failed to send reset email. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendVerification = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      await betterAuthClient.sendVerificationEmail({
        email,
        callbackURL: `${window.location.origin}?verified=true`,
      });
      setMode('check-email');
      setMessage('Verification email sent. Check your inbox.');
    } catch {
      setError('Failed to send verification email. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const renderCheckEmail = () => (
    <>
      <DialogHeader>
        <DialogTitle>Check Your Email</DialogTitle>
        <DialogDescription>{message}</DialogDescription>
      </DialogHeader>
      <div className="py-4">
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => handleOpenChange(false)}
        >
          Done
        </Button>
      </div>
    </>
  );

  const renderForgotPassword = () => (
    <>
      <DialogHeader>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleModeChange('signin')}
            className="rounded-full p-1 hover:bg-muted"
            aria-label="Back to sign in"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <DialogTitle>Reset Password</DialogTitle>
        </div>
        <DialogDescription>Enter your email and we'll send you a reset link</DialogDescription>
      </DialogHeader>
      <form onSubmit={handleForgotPassword} className="space-y-4 py-4">
        <div className="space-y-2">
          <Label htmlFor="forgot-email">Email</Label>
          <Input
            id="forgot-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            autoComplete="email"
          />
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? 'Sending...' : 'Send Reset Link'}
        </Button>
      </form>
    </>
  );

  const renderResendVerification = () => (
    <>
      <DialogHeader>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleModeChange('signin')}
            className="rounded-full p-1 hover:bg-muted"
            aria-label="Back to sign in"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <DialogTitle>Resend Verification</DialogTitle>
        </div>
        <DialogDescription>Enter your email to receive a new verification link</DialogDescription>
      </DialogHeader>
      <form onSubmit={handleResendVerification} className="space-y-4 py-4">
        <div className="space-y-2">
          <Label htmlFor="resend-email">Email</Label>
          <Input
            id="resend-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            autoComplete="email"
          />
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? 'Sending...' : 'Resend Verification Email'}
        </Button>
      </form>
    </>
  );

  const renderSignIn = () => (
    <>
      <DialogHeader>
        <DialogTitle>Sign In with Email</DialogTitle>
        <DialogDescription>Enter your email and password</DialogDescription>
      </DialogHeader>

      <form onSubmit={handleEmailSignIn} className="space-y-4 py-4">
        <div className="space-y-2">
          <Label htmlFor="signin-email">Email</Label>
          <Input
            id="signin-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            autoComplete="email"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="signin-password">Password</Label>
          <Input
            id="signin-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Your password"
            required
            autoComplete="current-password"
          />
        </div>
        {error && (
          <div className="space-y-2">
            <p className="text-sm text-red-500">{error}</p>
            {showResendVerification && (
              <button
                type="button"
                className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
                onClick={() => handleModeChange('resend-verification')}
              >
                Resend verification email
              </button>
            )}
          </div>
        )}
        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? 'Signing in...' : 'Sign In'}
        </Button>
        <div className="flex justify-between text-sm">
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => handleModeChange('forgot-password')}
          >
            Forgot password?
          </button>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => handleModeChange('signup')}
          >
            Create account
          </button>
        </div>
      </form>
    </>
  );

  const renderSignUp = () => (
    <>
      <DialogHeader>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleModeChange('signin')}
            className="rounded-full p-1 hover:bg-muted"
            aria-label="Back to sign in"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <DialogTitle>Create Account</DialogTitle>
        </div>
        <DialogDescription>Create an account with your email</DialogDescription>
      </DialogHeader>

      <form onSubmit={handleEmailSignUp} className="space-y-4 py-4">
        <div className="space-y-2">
          <Label htmlFor="signup-name">Display Name (optional)</Label>
          <Input
            id="signup-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            autoComplete="name"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="signup-email">Email</Label>
          <Input
            id="signup-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            autoComplete="email"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="signup-password">Password</Label>
          <Input
            id="signup-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            required
            minLength={8}
            autoComplete="new-password"
          />
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? 'Creating account...' : 'Create Account'}
        </Button>
      </form>
    </>
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        {mode === 'check-email' && renderCheckEmail()}
        {mode === 'forgot-password' && renderForgotPassword()}
        {mode === 'resend-verification' && renderResendVerification()}
        {mode === 'signin' && renderSignIn()}
        {mode === 'signup' && renderSignUp()}
      </DialogContent>
    </Dialog>
  );
}
