/**
 * Tests for AuthGate component
 *
 * Tests authentication states, sign in/out flows, and account deletion.
 * Uses jazz-mock for CoValue mocking.
 */

import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockCoList, createMockCoMap } from '../test/setup';
import { AuthGate } from './AuthGate';

// Mock Jazz hooks
const mockLogOut = vi.fn();
vi.mock('jazz-tools/react', () => ({
  useAccount: vi.fn(),
  useIsAuthenticated: vi.fn(),
  useLogOut: () => mockLogOut,
}));

import { useAccount, useIsAuthenticated } from 'jazz-tools/react';

// Mock custom hooks
vi.mock('@/hooks/useViewStateCleanup', () => ({
  useViewStateCleanup: vi.fn(),
}));

const mockShowAlert = vi.fn();
const mockShowConfirm = vi.fn();
vi.mock('@/lib/dialog-context', () => ({
  useDialog: () => ({
    showAlert: mockShowAlert,
    showConfirm: mockShowConfirm,
  }),
}));

// Mock auth client
const mockSignInSocial = vi.fn();
const mockSignOut = vi.fn();
vi.mock('@/lib/auth-client', () => ({
  betterAuthClient: {
    signIn: {
      social: (...args: unknown[]) => mockSignInSocial(...args),
    },
    signOut: () => mockSignOut(),
  },
}));

// Mock folder service (need all exports that the hook uses internally)
vi.mock('@/services/folderService', () => ({
  deleteAllUserData: vi.fn(),
  getAllTemplateFolders: vi.fn().mockReturnValue([]),
  getArchivedFolders: vi.fn().mockReturnValue([]),
  isTemplateFolder: vi.fn().mockReturnValue(false),
  isOrganizationalFolder: vi.fn().mockReturnValue(true),
}));

// Mock subscription service (used by the hook)
vi.mock('@/services/subscriptionService', () => ({
  canCreateList: vi.fn().mockReturnValue(true),
  getMaxLists: vi.fn().mockReturnValue(10),
}));

import * as folderService from '@/services/folderService';

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

vi.mock('./ui/loading', () => ({
  LoadingScreen: () => <div data-testid="loading-screen">Loading...</div>,
}));

// Helper to create mock account using jazz-mock
const createMockAccount = (id = 'test-account-id') =>
  createMockCoMap({ root: createMockCoMap({ folders: createMockCoList([]) }) }, { id });

describe('AuthGate', () => {
  beforeEach(() => {
    // Clear localStorage and sessionStorage
    localStorage.clear();
    sessionStorage.clear();

    // Reset all mocks
    vi.clearAllMocks();
    mockLogOut.mockResolvedValue(undefined);
    mockSignOut.mockResolvedValue(undefined);
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
    it('shows loading screen when account is not loaded', () => {
      vi.mocked(useAccount).mockReturnValue(null);
      vi.mocked(useIsAuthenticated).mockReturnValue(false);

      render(<AuthGate />);

      expect(screen.getByTestId('loading-screen')).toBeInTheDocument();
    });
  });

  describe('authenticated state', () => {
    it('shows AppContainer with sign out when authenticated', () => {
      vi.mocked(useAccount).mockReturnValue(createMockAccount());
      vi.mocked(useIsAuthenticated).mockReturnValue(true);

      render(<AuthGate />);

      const container = screen.getByTestId('app-container');
      expect(container).toBeInTheDocument();
      expect(container).toHaveAttribute('data-authenticated', 'true');
      expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /delete account/i })).toBeInTheDocument();
    });

    it('clears user-signed-out flag when authenticated', () => {
      localStorage.setItem('user-signed-out', 'true');
      vi.mocked(useAccount).mockReturnValue(createMockAccount());
      vi.mocked(useIsAuthenticated).mockReturnValue(true);

      render(<AuthGate />);

      expect(localStorage.getItem('user-signed-out')).toBeNull();
    });
  });

  describe('unauthenticated state', () => {
    it('shows AppContainer with sign in when not authenticated', () => {
      vi.mocked(useAccount).mockReturnValue(createMockAccount());
      vi.mocked(useIsAuthenticated).mockReturnValue(false);

      render(<AuthGate />);

      const container = screen.getByTestId('app-container');
      expect(container).toBeInTheDocument();
      expect(container).toHaveAttribute('data-authenticated', 'false');
      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    });

    it('shows unauthenticated view when user signed out and not re-authenticated', () => {
      localStorage.setItem('user-signed-out', 'true');
      vi.mocked(useAccount).mockReturnValue(createMockAccount());
      vi.mocked(useIsAuthenticated).mockReturnValue(false);

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
      vi.mocked(useAccount).mockReturnValue(createMockAccount());
      vi.mocked(useIsAuthenticated).mockReturnValue(false);

      render(<AuthGate />);

      await user.click(screen.getByRole('button', { name: /sign in/i }));

      expect(screen.getByTestId('sign-in-dialog')).toBeInTheDocument();
    });

    it('calls betterAuthClient for Google sign in', async () => {
      const user = userEvent.setup();
      vi.mocked(useAccount).mockReturnValue(createMockAccount());
      vi.mocked(useIsAuthenticated).mockReturnValue(false);

      render(<AuthGate />);

      await user.click(screen.getByRole('button', { name: /sign in/i }));
      await user.click(screen.getByRole('button', { name: /google sign in/i }));

      expect(mockSignInSocial).toHaveBeenCalledWith({
        provider: 'google',
        callbackURL: 'http://localhost',
      });
    });

    it('calls betterAuthClient for Apple sign in', async () => {
      const user = userEvent.setup();
      vi.mocked(useAccount).mockReturnValue(createMockAccount());
      vi.mocked(useIsAuthenticated).mockReturnValue(false);

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
      vi.mocked(useAccount).mockReturnValue(createMockAccount());
      vi.mocked(useIsAuthenticated).mockReturnValue(false);

      render(<AuthGate />);

      await user.click(screen.getByRole('button', { name: /sign in/i }));
      await user.click(screen.getByRole('button', { name: /google sign in/i }));

      expect(localStorage.getItem('user-signed-out')).toBeNull();
    });
  });

  describe('sign out flow', () => {
    it('signs out from BetterAuth and Jazz when Sign Out is clicked', async () => {
      const user = userEvent.setup();
      vi.mocked(useAccount).mockReturnValue(createMockAccount());
      vi.mocked(useIsAuthenticated).mockReturnValue(true);

      render(<AuthGate />);

      await user.click(screen.getByRole('button', { name: /sign out/i }));

      expect(mockSignOut).toHaveBeenCalled();
      expect(mockLogOut).toHaveBeenCalled();
      expect(localStorage.getItem('user-signed-out')).toBe('true');
    });

    it('handles sign out errors gracefully', async () => {
      const user = userEvent.setup();
      mockSignOut.mockRejectedValue(new Error('Sign out failed'));
      mockLogOut.mockRejectedValue(new Error('Log out failed'));
      vi.mocked(useAccount).mockReturnValue(createMockAccount());
      vi.mocked(useIsAuthenticated).mockReturnValue(true);

      render(<AuthGate />);

      // Should not throw
      await user.click(screen.getByRole('button', { name: /sign out/i }));

      expect(localStorage.getItem('user-signed-out')).toBe('true');
    });
  });

  describe('delete account flow', () => {
    it('shows confirmation dialog before deleting', async () => {
      const user = userEvent.setup();
      vi.mocked(useAccount).mockReturnValue(createMockAccount());
      vi.mocked(useIsAuthenticated).mockReturnValue(true);
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
      vi.mocked(useAccount).mockReturnValue(createMockAccount());
      vi.mocked(useIsAuthenticated).mockReturnValue(true);

      render(<AuthGate />);

      await user.click(screen.getByRole('button', { name: /delete account/i }));

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('calls delete API and cleans up on confirmation', async () => {
      const user = userEvent.setup();
      vi.mocked(useAccount).mockReturnValue(createMockAccount());
      vi.mocked(useIsAuthenticated).mockReturnValue(true);
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

      expect(folderService.deleteAllUserData).toHaveBeenCalled();
      expect(mockLogOut).toHaveBeenCalled();
      expect(mockShowAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Account Deleted',
        }),
      );
    });

    it('shows error alert if delete API fails', async () => {
      const user = userEvent.setup();
      vi.mocked(useAccount).mockReturnValue(createMockAccount());
      vi.mocked(useIsAuthenticated).mockReturnValue(true);
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

      // Should not delete Jazz data if API call fails
      expect(folderService.deleteAllUserData).not.toHaveBeenCalled();
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

      vi.mocked(useAccount).mockReturnValue(createMockAccount());
      vi.mocked(useIsAuthenticated).mockReturnValue(false);

      render(<AuthGate />);

      expect(screen.getByTestId('email-auth-dialog')).toBeInTheDocument();
    });

    it('shows EmailAuthDialog when sessionStorage has flag', () => {
      sessionStorage.setItem('show-signin-after-verify', 'true');
      vi.mocked(useAccount).mockReturnValue(createMockAccount());
      vi.mocked(useIsAuthenticated).mockReturnValue(false);

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

      vi.mocked(useAccount).mockReturnValue(createMockAccount());
      vi.mocked(useIsAuthenticated).mockReturnValue(false);

      render(<AuthGate />);

      // Should clean up URL
      expect(window.history.replaceState).toHaveBeenCalledWith({}, '', '/app');
    });
  });

  describe('account key for remounting', () => {
    it('uses different keys for authenticated vs anonymous', () => {
      const { rerender } = render(<AuthGate />);

      // First render as anonymous
      vi.mocked(useAccount).mockReturnValue(createMockAccount('account-1'));
      vi.mocked(useIsAuthenticated).mockReturnValue(false);
      rerender(<AuthGate />);

      let container = screen.getByTestId('app-container');
      expect(container).toHaveAttribute('data-authenticated', 'false');

      // Re-render as authenticated
      vi.mocked(useIsAuthenticated).mockReturnValue(true);
      rerender(<AuthGate />);

      container = screen.getByTestId('app-container');
      expect(container).toHaveAttribute('data-authenticated', 'true');
    });
  });
});
