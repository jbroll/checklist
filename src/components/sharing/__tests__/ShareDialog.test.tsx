import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FolderRow } from '@/schema/folder';

const mockCreateInvite = vi.fn().mockResolvedValue({
  token: 'tok',
  shareUrl: 'https://app/invite/tok',
  emailSent: true,
});
const mockGetCollaborators = vi.fn().mockResolvedValue([]);
const mockGetPendingInvites = vi.fn().mockResolvedValue([]);
const mockRemoveCollaborator = vi.fn().mockResolvedValue(undefined);
const mockRevokeInvite = vi.fn().mockResolvedValue(undefined);

vi.mock('@jbroll/rowboat-sharing-react', () => ({
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

import { ShareDialog } from '../ShareDialog';

const folder = { id: 'folder-1', owner_group_id: 'grp_zTest', name: 'Groceries' } as FolderRow;

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
  });

  it('does not render when closed', () => {
    render(<ShareDialog open={false} onOpenChange={() => {}} folder={folder} />);
    expect(screen.queryByText(/Share "Groceries"/)).not.toBeInTheDocument();
  });

  it('loads collaborators and pending invites when opened', async () => {
    render(<ShareDialog open onOpenChange={() => {}} folder={folder} />);
    await waitFor(() => {
      expect(mockGetCollaborators).toHaveBeenCalledWith('grp_zTest');
      expect(mockGetPendingInvites).toHaveBeenCalledWith('grp_zTest');
    });
  });

  it('calls createInvite with the folder scope group, recipient, role and extra options', async () => {
    render(<ShareDialog open onOpenChange={() => {}} folder={folder} />);
    fireEvent.change(screen.getByPlaceholderText(/colleague@example.com/i), {
      target: { value: 'r@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /email invite/i }));
    await waitFor(() => expect(mockCreateInvite).toHaveBeenCalled());
    expect(mockCreateInvite).toHaveBeenCalledWith('grp_zTest', 'r@example.com', 'writer', {
      sendEmail: true,
      expiresInDays: 7,
    });
  });

  it('copy link sends sendEmail=false', async () => {
    render(<ShareDialog open onOpenChange={() => {}} folder={folder} />);
    fireEvent.change(screen.getByPlaceholderText(/colleague@example.com/i), {
      target: { value: 'r@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /copy link/i }));
    await waitFor(() => expect(mockCreateInvite).toHaveBeenCalled());
    expect(mockCreateInvite.mock.calls[0][3]).toMatchObject({ sendEmail: false });
  });

  it('shows success message after email invite', async () => {
    render(<ShareDialog open onOpenChange={() => {}} folder={folder} />);
    fireEvent.change(screen.getByPlaceholderText(/colleague@example.com/i), {
      target: { value: 'test@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /email invite/i }));
    await waitFor(() => {
      expect(screen.getByText(/Invite emailed to test@example.com/)).toBeInTheDocument();
    });
  });

  it('shows no-collaborators state initially', async () => {
    render(<ShareDialog open onOpenChange={() => {}} folder={folder} />);
    await waitFor(() => {
      expect(screen.getByText(/No collaborators yet/)).toBeInTheDocument();
    });
  });

  it('renders collaborators after load', async () => {
    mockGetCollaborators.mockResolvedValue([
      { accountId: 'acc_u1', email: 'alice@example.com', name: 'Alice', role: 'writer' },
    ]);
    render(<ShareDialog open onOpenChange={() => {}} folder={folder} />);
    await waitFor(() => expect(screen.getByText(/Collaborators \(1\)/)).toBeInTheDocument());
    expect(screen.getByText('Alice')).toBeInTheDocument();
  });

  it('calls removeCollaborator when remove is clicked', async () => {
    (global as any).confirm = vi.fn().mockReturnValue(true);
    mockGetCollaborators.mockResolvedValue([
      { accountId: 'acc_u1', email: 'alice@example.com', name: 'Alice', role: 'writer' },
    ]);
    render(<ShareDialog open onOpenChange={() => {}} folder={folder} />);
    await waitFor(() => expect(screen.getByText('Alice')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Remove Alice/i }));
    await waitFor(() => expect(mockRemoveCollaborator).toHaveBeenCalledWith('grp_zTest', 'acc_u1'));
  });

  it('renders pending invites and calls revokeInvite on click', async () => {
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
