import { useState, useEffect } from 'react';
import { betterAuthClient } from '@/lib/auth-client';
import { useAccount } from '@/lib/jazz';
import { GroceriesAccount, ListsRoot } from '@/schemas';
import { ListsView } from './lists/ListsView';

export function Dashboard() {
  const [isLoading, setIsLoading] = useState(false);
  const { me, logOut } = useAccount(GroceriesAccount);

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    try {
      await betterAuthClient.signIn.social({
        provider: 'google',
        callbackURL: `${window.location.origin}/`,
      });
    } catch (error) {
      console.error('Google sign-in error:', error);
      alert('Google sign-in failed. Check the console for details.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAppleSignIn = async () => {
    alert(
      'Apple OAuth is not yet configured. Please add Apple credentials to the backend/.env file.',
    );
  };

  const handleSignOut = async () => {
    try {
      await logOut();
      await betterAuthClient.signOut();
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  // Show loading state while account is being loaded
  if (me === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-neutral-300 border-t-neutral-900 mx-auto"></div>
          <p className="mt-4 text-neutral-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Initialize root for new users
  useEffect(() => {
    if (me && !me.root) {
      const root = ListsRoot.create(
        {
          myLists: [],
          sharedLists: [],
        },
        { owner: me }
      );
      (me as any).root = root;
    }
  }, [me]);

  // Show setup message if root is being initialized
  if (me && !me.root) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-neutral-300 border-t-neutral-900 mx-auto"></div>
          <p className="mt-4 text-neutral-600">Setting up your account...</p>
        </div>
      </div>
    );
  }

  // Show lists view if authenticated and account is ready
  if (me && me.root) {
    return <ListsView account={me} onSignOut={handleSignOut} />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-neutral-900">🛒 GroceryList</h1>
          <p className="mt-2 text-neutral-600">
            Collaborative shopping lists that sync in real-time
          </p>
        </div>

        <div className="rounded-lg border border-neutral-200 bg-white p-8 shadow-sm">
          <h2 className="mb-6 text-center text-xl font-semibold">Sign in to continue</h2>

          <div className="space-y-3">
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isLoading}
              className="flex w-full items-center justify-center gap-3 rounded-lg border border-neutral-300 bg-white px-4 py-3 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 disabled:opacity-50"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" role="img" aria-label="Google logo">
                <path
                  fill="currentColor"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="currentColor"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="currentColor"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="currentColor"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              Continue with Google
            </button>

            <button
              type="button"
              onClick={handleAppleSignIn}
              disabled={isLoading}
              className="flex w-full items-center justify-center gap-3 rounded-lg border border-neutral-900 bg-neutral-900 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-neutral-800 disabled:opacity-50"
            >
              <svg
                className="h-5 w-5"
                fill="currentColor"
                viewBox="0 0 24 24"
                role="img"
                aria-label="Apple logo"
              >
                <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
              </svg>
              Continue with Apple
            </button>
          </div>

          <div className="mt-6 text-center text-sm text-neutral-500">
            By continuing, you agree to our Terms of Service and Privacy Policy
          </div>
        </div>

        <div className="text-center text-sm text-neutral-500">
          <p>Built with Jazz.tools & BetterAuth</p>
          <p className="mt-1">Real-time sync • Offline-first • End-to-end encrypted</p>
        </div>
      </div>
    </div>
  );
}
