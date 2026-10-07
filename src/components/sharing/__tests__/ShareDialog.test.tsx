import { SharingError } from '@jbroll/rowboat-sharing-react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FolderRow } from '@/schema/folder';

const mockCreateInvite = vi.fn();
const mockGetCollaborators = vi.fn();
const mockGetPendingInvites = vi.fn();
const mockRemoveCollaborator = vi.fn();
const mockRevokeInvite = vi.fn();

// Only the fetch layer is faked; the real useShareManager drives the dialog.
vi.mock('@jbroll/rowboat-sharing-react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@jbroll/rowboat-sharing-react')>()),
  useSharing: () => ({
    createInvite: mockCreateInvite,
    validateInvite: vi.fn(),
    acceptInvite: vi.fn(),
    getPendingInvites: mockGetPendingInvites,
    revokeInvite: mockRevokeInvite,
    getCollaborators: mockGetCollaborators,
    removeCollaborator: mockRemoveCollaborator,
    getUserMemberships: vi.fn(),
    isLoading: false,
    error: null,
  }),
}));

import { inviteTargetName, ShareDialog } from '../ShareDialog';

const folder = { id: 'folder-1', owner_group_id: 'grp_zTest', name: 'Groceries' } as FolderRow;

function enterRecipient(value: string) {
  fireEvent.change(screen.getByPlaceholderText(/colleague@example.com/i), {
    target: { value },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateInvite.mockResolvedValue({
    token: 'tok',
    shareUrl: 'https://app/invite/tok',
    emailSent: true,
  });
  mockGetCollaborators.mockResolvedValue([]);
  mockGetPendingInvites.mockResolvedValue([]);
  mockRemoveCollaborator.mockResolvedValue(undefined);
  mockRevokeInvite.mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    configurable: true,
  });
});

afterEach(() => {
  (global as any).confirm = undefined;
});

describe('ShareDialog', () => {
  it('renders dialog title and invite input when open', async () => {
    render(<ShareDialog open onOpenChange={() => {}} folder={folder} />);
    expect(screen.getByText(/Share "Groceries"/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/colleague@example.com/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/No collaborators yet/)).toBeInTheDocument());
  });

  it('does not render or load anything when closed', () => {
    render(<ShareDialog open={false} onOpenChange={() => {}} folder={folder} />);
    expect(screen.queryByText(/Share "Groceries"/)).not.toBeInTheDocument();
    expect(mockGetCollaborators).not.toHaveBeenCalled();
  });

  it('loads collaborators and pending invites when opened', async () => {
    render(<ShareDialog open onOpenChange={() => {}} folder={folder} />);
    await waitFor(() => {
      expect(mockGetCollaborators).toHaveBeenCalledWith('grp_zTest');
      expect(mockGetPendingInvites).toHaveBeenCalledWith('grp_zTest');
    });
  });

  it('invites with the folder scope group, role, expiry, and the folder name', async () => {
    render(<ShareDialog open onOpenChange={() => {}} folder={folder} />);
    enterRecipient('r@example.com');
    fireEvent.click(screen.getByRole('button', { name: /email invite/i }));
    await waitFor(() => expect(mockCreateInvite).toHaveBeenCalled());
    expect(mockCreateInvite).toHaveBeenCalledWith('grp_zTest', 'r@example.com', 'writer', {
      sendEmail: true,
      expiresInDays: 7,
      targetName: 'Groceries',
    });
  });

  it('copy link sends sendEmail=false', async () => {
    render(<ShareDialog open onOpenChange={() => {}} folder={folder} />);
    enterRecipient('r@example.com');
    fireEvent.click(screen.getByRole('button', { name: /copy link/i }));
    await waitFor(() => expect(mockCreateInvite).toHaveBeenCalled());
    expect(mockCreateInvite.mock.calls[0][3]).toMatchObject({ sendEmail: false });
  });

  it('shows the success message and share link after an email invite', async () => {
    render(<ShareDialog open onOpenChange={() => {}} folder={folder} />);
    enterRecipient('test@example.com');
    fireEvent.click(screen.getByRole('button', { name: /email invite/i }));
    await waitFor(() => {
      expect(screen.getByText(/Invite emailed to test@example.com/)).toBeInTheDocument();
    });
    expect(screen.getByDisplayValue('https://app/invite/tok')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/colleague@example.com/i)).toHaveValue('');
  });

  it.each([
    ['root_group', 400, /can't be shared as it is/],
    ['forbidden', 403, /Only an admin of this list can share it/],
    ['invalid_role', 400, /Something went wrong/],
    [null, 401, /Something went wrong/],
  ])('shows the message for a %s failure, not the server text', async (code, status, text) => {
    mockCreateInvite.mockRejectedValue(new SharingError('raw server text', status, code));
    render(<ShareDialog open onOpenChange={() => {}} folder={folder} />);
    enterRecipient('r@example.com');
    fireEvent.click(screen.getByRole('button', { name: /email invite/i }));
    await waitFor(() => expect(screen.getByText(text)).toBeInTheDocument());
    expect(screen.queryByText('raw server text')).not.toBeInTheDocument();
    expect(screen.queryByText(/Invite emailed/)).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText(/colleague@example.com/i)).toHaveValue('r@example.com');
  });

  it('renders collaborators after load', async () => {
    mockGetCollaborators.mockResolvedValue([
      { accountId: 'acc_u1', email: 'alice@example.com', name: 'Alice', role: 'writer' },
    ]);
    render(<ShareDialog open onOpenChange={() => {}} folder={folder} />);
    await waitFor(() => expect(screen.getByText(/Collaborators \(1\)/)).toBeInTheDocument());
    expect(screen.getByText('Alice')).toBeInTheDocument();
  });

  it('removes a collaborator after confirm', async () => {
    (global as any).confirm = vi.fn().mockReturnValue(true);
    mockGetCollaborators.mockResolvedValue([
      { accountId: 'acc_u1', email: 'alice@example.com', name: 'Alice', role: 'writer' },
    ]);
    render(<ShareDialog open onOpenChange={() => {}} folder={folder} />);
    await waitFor(() => expect(screen.getByText('Alice')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Remove Alice/i }));
    await waitFor(() => expect(mockRemoveCollaborator).toHaveBeenCalledWith('grp_zTest', 'acc_u1'));
  });

  it('does not remove a collaborator when confirm is declined', async () => {
    (global as any).confirm = vi.fn().mockReturnValue(false);
    mockGetCollaborators.mockResolvedValue([
      { accountId: 'acc_u1', email: 'alice@example.com', name: 'Alice', role: 'writer' },
    ]);
    render(<ShareDialog open onOpenChange={() => {}} folder={folder} />);
    await waitFor(() => expect(screen.getByText('Alice')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Remove Alice/i }));
    expect(mockRemoveCollaborator).not.toHaveBeenCalled();
  });

  it('renders pending invites and revokes on click', async () => {
    (global as any).confirm = vi.fn().mockReturnValue(true);
    mockGetPendingInvites.mockResolvedValue([
      {
        token: 'test-token',
        recipientEmail: 'invited@example.com',
        role: 'writer',
        appRole: null,
        createdAt: Date.now(),
        expiresAt: Date.now() + 7 * 86400_000,
      },
    ]);
    render(<ShareDialog open onOpenChange={() => {}} folder={folder} />);
    await waitFor(() => expect(screen.getByText('invited@example.com')).toBeInTheDocument());
    expect(screen.getByText(/Pending Invites \(1\)/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Revoke invite/i }));
    await waitFor(() => expect(mockRevokeInvite).toHaveBeenCalledWith('test-token'));
  });
});

describe('inviteTargetName', () => {
  it('keeps a short one-line name', () => {
    expect(inviteTargetName('Groceries')).toBe('Groceries');
  });

  it('folds line breaks and runs of whitespace into single spaces', () => {
    expect(inviteTargetName('  Lake\r\nHouse\t list  ')).toBe('Lake House list');
  });

  it('truncates to 200 characters', () => {
    expect(inviteTargetName('x'.repeat(250))).toHaveLength(200);
  });

  it('does not split a surrogate pair at the cut', () => {
    const name = `${'x'.repeat(199)}🛒`;
    expect(inviteTargetName(name)).toBe('x'.repeat(199));
  });

  it('omits a blank name', () => {
    expect(inviteTargetName(' \n ')).toBeUndefined();
  });
});
