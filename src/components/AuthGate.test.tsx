/**
 * Tests for AuthGate component
 *
 * Tests authentication states, sign in/out flows, and account deletion, against the rowboat
 * `@/jazz` waist (better-auth `useAuthor`/`useSession`/`signIn`/`signOut`).
 */

import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthGate } from './AuthGate';

// Mock the rowboat waist (@/lib/jazz.tsx re-exported through @/jazz) — AuthGate only uses the
// auth surface (useAuthor/useSession/signIn/signOut), not the graph.
const mockSignInSocial = vi.fn();
const mockJazzSignOut = vi.fn();
let mockAuthor: string | null = null;
let mockSessionPending = false;

vi.mock('@/jazz', () => ({
  useAuthor: () => mockAuthor,
  useSession: () => ({ isPending: mockSessionPending }),
  signIn: { social: (...args: unknown[]) => mockSignInSocial(...args) },
  signOut: () => mockJazzSignOut(),
}));

const mockShowAlert = vi.fn();
const mockShowConfirm = vi.fn();
vi.mock('@/lib/dialog-context', () => ({
  useDialog: () => ({
    showAlert: mockShowAlert,
    showConfirm: mockShowConfirm,
  }),
}));

// Mock child components
vi.mock('./auth/EmailAuthDialog', () => ({
  EmailAuthDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="email-auth-dialog">Email Auth Dialog</div> : null,
}));

vi.mock('./auth/SignInDialog', () => ({
  SignInDialog: ({
    open,
    onGoogleSignIn,
    onAppleSignIn,
  }: {
    open: boolean;
    onGoogleSignIn: () => void;
    onAppleSignIn: () => void;
  }) =>
    open ? (
      <div data-testid="sign-in-dialog">
        <button type="button" onClick={onGoogleSignIn}>
          Google Sign In
        </button>
        <button type="button" onClick={onAppleSignIn}>
          Apple Sign In
        </button>
      </div>
    ) : null,
}));

vi.mock('./editor/AppContainer', () => ({
  AppContainer: ({
    onSignIn,
    onSignOut,
    onDeleteAccount,
    isAuthenticated,
  }: {
    onSignIn?: () => void;
    onSignOut?: () => void;
    onDeleteAccount?: () => void;
    isAuthenticated: boolean;
  }) => (
    <div data-testid="app-container" data-authenticated={isAuthenticated}>
      {onSignIn && (
        <button type="button" onClick={onSignIn}>
          Sign In
        </button>
      )}
      {onSignOut && (
        <button type="button" onClick={onSignOut}>
          Sign Out
        </button>
      )}
      {onDeleteAccount && (
        <button type="button" onClick={onDeleteAccount}>
          Delete Account
        </button>
      )}
    </div>
  ),
}));

describe('AuthGate', () => {
  beforeEach(() => {
    mockAuthor = null;
    mockSessionPending = false;

    // Clear localStorage and sessionStorage
    localStorage.clear();
    sessionStorage.clear();

    // Reset all mocks
    vi.clearAllMocks();
    mockJazzSignOut.mockResolvedValue(undefined);
    mockShowConfirm.mockResolvedValue(true);
    mockShowAlert.mockResolvedValue(undefined);

    // Mock window.location
    Object.defineProperty(window, 'location', {
      value: {
        search: '',
        pathname: '/',
        origin: 'http://localhost',
        href: 'http://localhost/',
      },
      writable: true,
    });

    // Mock window.history.replaceState
    window.history.replaceState = vi.fn();

    // Mock fetch for delete account
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('loading state', () => {
    it('renders nothing while the session is pending', () => {
      mockSessionPending = true;

      const { container } = render(<AuthGate />);

      expect(container).toBeEmptyDOMElement();
    });
  });

  describe('authenticated state', () => {
    it('shows AppContainer with sign out when authenticated', () => {
      mockAuthor = 'user-1';

      render(<AuthGate />);

      const container = screen.getByTestId('app-container');
      expect(container).toBeInTheDocument();
      expect(container).toHaveAttribute('data-authenticated', 'true');
      expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /delete account/i })).toBeInTheDocument();
    });

    it('clears user-signed-out flag when authenticated', () => {
      localStorage.setItem('user-signed-out', 'true');
      mockAuthor = 'user-1';

      render(<AuthGate />);

      expect(localStorage.getItem('user-signed-out')).toBeNull();
    });
  });

  describe('unauthenticated state', () => {
    it('shows AppContainer with sign in when not authenticated', () => {
      render(<AuthGate />);

      const container = screen.getByTestId('app-container');
      expect(container).toBeInTheDocument();
      expect(container).toHaveAttribute('data-authenticated', 'false');
      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    });

    it('shows unauthenticated view when user signed out and not re-authenticated', () => {
      localStorage.setItem('user-signed-out', 'true');

      render(<AuthGate />);

      // User signed out flag persists when not authenticated
      const container = screen.getByTestId('app-container');
      expect(container).toHaveAttribute('data-authenticated', 'false');
      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    });
  });

  describe('sign in flow', () => {
    it('opens SignInDialog when Sign In button is clicked', async () => {
      const user = userEvent.setup();

      render(<AuthGate />);

      await user.click(screen.getByRole('button', { name: /sign in/i }));

      expect(screen.getByTestId('sign-in-dialog')).toBeInTheDocument();
    });

    it('calls signIn.social for Google sign in', async () => {
      const user = userEvent.setup();

      render(<AuthGate />);

      await user.click(screen.getByRole('button', { name: /sign in/i }));
      await user.click(screen.getByRole('button', { name: /google sign in/i }));

      expect(mockSignInSocial).toHaveBeenCalledWith({
        provider: 'google',
        callbackURL: 'http://localhost',
      });
    });

    it('calls signIn.social for Apple sign in', async () => {
      const user = userEvent.setup();

      render(<AuthGate />);

      await user.click(screen.getByRole('button', { name: /sign in/i }));
      await user.click(screen.getByRole('button', { name: /apple sign in/i }));

      expect(mockSignInSocial).toHaveBeenCalledWith({
        provider: 'apple',
        callbackURL: 'http://localhost',
      });
    });

    it('clears user-signed-out flag on sign in', async () => {
      const user = userEvent.setup();
      localStorage.setItem('user-signed-out', 'true');

      render(<AuthGate />);

      await user.click(screen.getByRole('button', { name: /sign in/i }));
      await user.click(screen.getByRole('button', { name: /google sign in/i }));

      expect(localStorage.getItem('user-signed-out')).toBeNull();
    });
  });

  describe('sign out flow', () => {
    it('signs out via the rowboat auth client when Sign Out is clicked', async () => {
      const user = userEvent.setup();
      mockAuthor = 'user-1';

      render(<AuthGate />);

      await user.click(screen.getByRole('button', { name: /sign out/i }));

      expect(mockJazzSignOut).toHaveBeenCalled();
      expect(localStorage.getItem('user-signed-out')).toBe('true');
    });

    it('handles sign out errors gracefully', async () => {
      const user = userEvent.setup();
      mockJazzSignOut.mockRejectedValue(new Error('Sign out failed'));
      mockAuthor = 'user-1';

      render(<AuthGate />);

      // Should not throw
      await user.click(screen.getByRole('button', { name: /sign out/i }));

      expect(localStorage.getItem('user-signed-out')).toBe('true');
    });
  });

  describe('delete account flow', () => {
    it('shows confirmation dialog before deleting', async () => {
      const user = userEvent.setup();
      mockAuthor = 'user-1';
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      } as Response);

      render(<AuthGate />);

      await user.click(screen.getByRole('button', { name: /delete account/i }));

      expect(mockShowConfirm).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Delete Account',
          variant: 'danger',
        }),
      );
    });

    it('does not delete if user cancels confirmation', async () => {
      const user = userEvent.setup();
      mockShowConfirm.mockResolvedValue(false);
      mockAuthor = 'user-1';

      render(<AuthGate />);

      await user.click(screen.getByRole('button', { name: /delete account/i }));

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('calls delete API and cleans up on confirmation', async () => {
      const user = userEvent.setup();
      mockAuthor = 'user-1';
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      } as Response);

      render(<AuthGate />);

      await user.click(screen.getByRole('button', { name: /delete account/i }));

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('/api/account', {
          method: 'DELETE',
          headers: { 'X-Requested-With': 'XMLHttpRequest' },
          credentials: 'include',
        });
      });

      await waitFor(() => {
        expect(mockJazzSignOut).toHaveBeenCalled();
      });
      expect(mockShowAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Account Deleted',
        }),
      );
    });

    it('shows error alert if delete API fails', async () => {
      const user = userEvent.setup();
      mockAuthor = 'user-1';
      vi.mocked(global.fetch).mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: 'Server error' }),
      } as Response);

      render(<AuthGate />);

      await user.click(screen.getByRole('button', { name: /delete account/i }));

      await waitFor(() => {
        expect(mockShowAlert).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Error',
            message: 'Server error',
          }),
        );
      });

      // Should not sign out (nor show the "Account Deleted" alert) if the API call fails
      expect(mockJazzSignOut).not.toHaveBeenCalled();
    });
  });

  describe('email verification flow', () => {
    it('shows EmailAuthDialog when URL has verified=true', () => {
      Object.defineProperty(window, 'location', {
        value: {
          search: '?verified=true',
          pathname: '/',
          origin: 'http://localhost',
          href: 'http://localhost/?verified=true',
        },
        writable: true,
      });

      render(<AuthGate />);

      expect(screen.getByTestId('email-auth-dialog')).toBeInTheDocument();
    });

    it('shows EmailAuthDialog when sessionStorage has flag', () => {
      sessionStorage.setItem('show-signin-after-verify', 'true');

      render(<AuthGate />);

      expect(screen.getByTestId('email-auth-dialog')).toBeInTheDocument();
    });

    it('cleans up URL and sessionStorage after showing dialog', () => {
      Object.defineProperty(window, 'location', {
        value: {
          search: '?verified=true',
          pathname: '/app',
          origin: 'http://localhost',
          href: 'http://localhost/app?verified=true',
        },
        writable: true,
      });

      render(<AuthGate />);

      // Should clean up URL
      expect(window.history.replaceState).toHaveBeenCalledWith({}, '', '/app');
    });
  });

  describe('account key for remounting', () => {
    it('uses different keys for authenticated vs anonymous', () => {
      const { rerender } = render(<AuthGate />);

      // First render as anonymous
      rerender(<AuthGate />);

      let container = screen.getByTestId('app-container');
      expect(container).toHaveAttribute('data-authenticated', 'false');

      // Re-render as authenticated
      mockAuthor = 'account-1';
      rerender(<AuthGate />);

      container = screen.getByTestId('app-container');
      expect(container).toHaveAttribute('data-authenticated', 'true');
    });
  });
});
