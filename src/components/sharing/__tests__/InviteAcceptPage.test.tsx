import { SharingError, takeStashedInviteToken } from '@jbroll/rowboat-sharing-react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockValidateInvite = vi.fn();
const mockAcceptInvite = vi.fn();
const mockSignInSocial = vi.fn();
let mockAuthor: string | null = 'user-1';
let mockSessionPending = false;

// Only the fetch layer is faked; the real useInviteAcceptance drives the page.
vi.mock('@jbroll/rowboat-sharing-react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@jbroll/rowboat-sharing-react')>()),
  useSharing: () => ({
    createInvite: vi.fn(),
    validateInvite: mockValidateInvite,
    acceptInvite: mockAcceptInvite,
    getPendingInvites: vi.fn(),
    revokeInvite: vi.fn(),
    getCollaborators: vi.fn(),
    removeCollaborator: vi.fn(),
    getUserMemberships: vi.fn(),
    isLoading: false,
    error: null,
  }),
}));

vi.mock('@/rowboat', () => ({
  useAuthor: () => mockAuthor,
  useSession: () => ({
    isPending: mockSessionPending,
    data: mockAuthor ? { user: { email: 'me@example.com' } } : null,
  }),
  signIn: { social: (...args: unknown[]) => mockSignInSocial(...args) },
  signOut: vi.fn(),
}));

import { InviteAcceptPage } from '../InviteAcceptPage';

const TOKEN = 'cd'.repeat(32);

function validInvite(extra: Record<string, unknown> = {}) {
  return {
    valid: true,
    inviter: { deleted: false, email: 'alice@example.com' },
    role: 'writer',
    appRole: null,
    targetName: null,
    ...extra,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuthor = 'user-1';
  mockSessionPending = false;
  sessionStorage.clear();
  Object.defineProperty(window, 'location', {
    value: { origin: 'http://localhost', href: `http://localhost/invite/${TOKEN}` },
    writable: true,
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('InviteAcceptPage', () => {
  it('shows the loading state while the session resolves', () => {
    mockSessionPending = true;
    render(<InviteAcceptPage token={TOKEN} />);
    expect(screen.getByText('Loading invite...')).toBeInTheDocument();
    expect(mockValidateInvite).not.toHaveBeenCalled();
  });

  it('asks an anonymous visitor to sign in without validating', () => {
    mockAuthor = null;
    render(<InviteAcceptPage token={TOKEN} />);
    expect(screen.getByText('Sign In to Continue')).toBeInTheDocument();
    expect(mockValidateInvite).not.toHaveBeenCalled();
  });

  it('stashes the token before the OAuth round trip', () => {
    mockAuthor = null;
    render(<InviteAcceptPage token={TOKEN} />);
    fireEvent.click(screen.getByRole('button', { name: /Continue with Google/ }));
    expect(mockSignInSocial).toHaveBeenCalledWith({
      provider: 'google',
      callbackURL: 'http://localhost',
    });
    expect(takeStashedInviteToken()).toEqual({ available: true, token: TOKEN });
  });

  it.each([
    ['Google', 'google'],
    ['Apple', 'apple'],
  ])('sends %s sign-in back to the invite page when the browser refuses the stash', (name, provider) => {
    mockAuthor = null;
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    render(<InviteAcceptPage token={TOKEN} />);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`Continue with ${name}`) }));
    expect(mockSignInSocial).toHaveBeenCalledWith({
      provider,
      callbackURL: `http://localhost/invite/${TOKEN}`,
    });
    setItem.mockRestore();
  });

  it('shows the wrong-account screen when validate says wrong_account, before any accept', async () => {
    mockValidateInvite.mockResolvedValue({ valid: false, code: 'wrong_account' });
    render(<InviteAcceptPage token={TOKEN} />);
    expect(await screen.findByText('Wrong Account')).toBeInTheDocument();
    expect(screen.getByText(/signed in as me@example.com/)).toBeInTheDocument();
    expect(mockAcceptInvite).not.toHaveBeenCalled();
  });

  it('says the answer could not be read when validate sends the old inviterEmail shape', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockValidateInvite.mockResolvedValue({
      valid: true,
      inviterEmail: 'alice@example.com',
      role: 'writer',
    });
    render(<InviteAcceptPage token={TOKEN} />);
    expect(
      await screen.findByText(
        "The server's answer about this invite could not be read. Please try again later.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Accept Invite' })).not.toBeInTheDocument();
    consoleError.mockRestore();
  });

  it('names the list in a valid invite when it has a target name', async () => {
    mockValidateInvite.mockResolvedValue(validInvite({ targetName: 'Lake House' }));
    render(<InviteAcceptPage token={TOKEN} />);
    expect(
      await screen.findByText('alice@example.com has invited you to Lake House'),
    ).toBeInTheDocument();
    expect(screen.getByText('Writer')).toBeInTheDocument();
  });

  it('falls back to "collaborate" without a target name', async () => {
    mockValidateInvite.mockResolvedValue(validInvite({ targetName: null }));
    render(<InviteAcceptPage token={TOKEN} />);
    expect(
      await screen.findByText('alice@example.com has invited you to collaborate'),
    ).toBeInTheDocument();
  });

  it('shows the generic invalid message when validate says no', async () => {
    mockValidateInvite.mockResolvedValue({ valid: false, code: 'invalid_token' });
    render(<InviteAcceptPage token={TOKEN} />);
    expect(await screen.findByText('This invite link is no longer valid.')).toBeInTheDocument();
  });

  it('shows a retry message without a code when validate fails on the network', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failure = new TypeError('network down');
    mockValidateInvite.mockRejectedValue(failure);
    render(<InviteAcceptPage token={TOKEN} />);
    expect(
      await screen.findByText('Something went wrong with this invite. Please try again.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/network down/)).not.toBeInTheDocument();
    expect(consoleError).toHaveBeenCalledWith('[sharing] invite:', failure);
    consoleError.mockRestore();
  });

  it('accepts, shows success, then returns to the dashboard', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockValidateInvite.mockResolvedValue(validInvite());
    mockAcceptInvite.mockResolvedValue({ targetGroupId: 'grp_1', alreadyMember: false });
    render(<InviteAcceptPage token={TOKEN} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Accept Invite' }));
    expect(await screen.findByText('Access Granted!')).toBeInTheDocument();
    expect(mockAcceptInvite).toHaveBeenCalledWith(TOKEN);
    expect(window.location.href).not.toBe('/');

    // Under load the redirect effect can schedule its timer after the success screen renders.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    await waitFor(() => expect(window.location.href).toBe('/'));
  });

  it('shows the wrong-account screen when accept says wrong_account', async () => {
    mockValidateInvite.mockResolvedValue(validInvite());
    mockAcceptInvite.mockRejectedValue(
      new SharingError('This invite was not sent to your account', 403, 'wrong_account'),
    );
    render(<InviteAcceptPage token={TOKEN} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Accept Invite' }));
    expect(await screen.findByText('Wrong Account')).toBeInTheDocument();
    expect(screen.getByText(/signed in as me@example.com/)).toBeInTheDocument();
  });

  it('says the invite is still valid when accept says an earlier undo is pending', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockValidateInvite.mockResolvedValue(validInvite());
    mockAcceptInvite.mockRejectedValue(new SharingError('undo owed', 503, 'undo_pending'));
    render(<InviteAcceptPage token={TOKEN} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Accept Invite' }));
    expect(
      await screen.findByText(
        "An earlier invite to this list for your account is still being undone. This invite is still valid, so try again in a minute. If this keeps happening, ask the list's owner to remove you and invite you again. (undo_pending)",
      ),
    ).toBeInTheDocument();
    consoleError.mockRestore();
  });

  it('shows the invalid message when accept says invalid_token', async () => {
    mockValidateInvite.mockResolvedValue(validInvite());
    mockAcceptInvite.mockRejectedValue(new SharingError('gone', 400, 'invalid_token'));
    render(<InviteAcceptPage token={TOKEN} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Accept Invite' }));
    expect(
      await screen.findByText('This invite link is no longer valid. (invalid_token)'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/gone/)).not.toBeInTheDocument();
  });

  it.each([
    [
      'inviter_no_longer_admin',
      403,
      'The person who invited you can no longer share this list. Ask its owner for a new invite. (inviter_no_longer_admin)',
    ],
    [
      'grant_refused',
      403,
      'This list can no longer be shared from this invite. Ask its owner for a new one. (grant_refused)',
    ],
    [
      'blocked',
      403,
      'Your account has blocked the person who sent this invite, so it cannot be accepted. (blocked)',
    ],
    [
      'unknown_role',
      400,
      'This invite gives a permission level that no longer exists. Ask for a new invite. (unknown_role)',
    ],
    [
      'root_group',
      400,
      "This invite is for your account's private group, which can't be shared. (root_group)",
    ],
  ])('explains an accept refused with %s', async (code, status, text) => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockValidateInvite.mockResolvedValue(validInvite());
    mockAcceptInvite.mockRejectedValue(new SharingError('nope', status, code));
    render(<InviteAcceptPage token={TOKEN} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Accept Invite' }));
    expect(await screen.findByText(text)).toBeInTheDocument();
    consoleError.mockRestore();
  });

  it('gives the status for an accept the server answered without a code', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockValidateInvite.mockResolvedValue(validInvite());
    mockAcceptInvite.mockRejectedValue(new SharingError('POST /accept failed with 502', 502, null));
    render(<InviteAcceptPage token={TOKEN} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Accept Invite' }));
    expect(
      await screen.findByText('Something went wrong with this invite. Please try again. (502)'),
    ).toBeInTheDocument();
    consoleError.mockRestore();
  });
});
