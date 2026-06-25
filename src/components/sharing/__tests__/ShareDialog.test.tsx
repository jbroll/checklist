import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Stub SharePanel to avoid better-auth client instantiation at import time.
// Renders enough DOM for all tests to exercise handleCreateInvite / remove / revoke.
vi.mock('@jbr-jazz/hierarchy-client/components', () => {
  const React = require('react') as typeof import('react');

  type Collaborator = { accountId: string; name: string; permission: string };
  type PendingInvite = { token: string; recipientEmail: string; permission: string };
  type SharePanelProps = {
    onCreateInvite: (args: {
      recipient: string;
      permission: string;
      expiresInDays: number;
      sendEmail: boolean;
    }) => Promise<{ shareUrl: string }>;
    collaborators: Collaborator[];
    pendingInvites: PendingInvite[];
    onRemoveCollaborator?: (accountId: string) => void | Promise<void>;
    onRevokeInvite?: (token: string) => void | Promise<void>;
    isLoading?: boolean;
    permissions?: string[];
    permissionLabels?: Record<string, string>;
    defaultPermission?: string;
    defaultExpiresInDays?: number;
    recipientPlaceholder?: string;
    permissionColors?: Record<string, { bg: string; text: string }>;
    successMessageFor?: (args: { recipient: string; sendEmail: boolean }) => string;
    children?: React.ReactNode;
  };

  function SharePanel({
    onCreateInvite,
    collaborators,
    pendingInvites,
    onRemoveCollaborator,
    onRevokeInvite,
    permissions = ['reader', 'writer', 'admin'],
    permissionLabels = {},
    defaultPermission = 'writer',
    defaultExpiresInDays = 7,
    recipientPlaceholder = 'colleague@example.com or +1234567890',
    successMessageFor,
  }: SharePanelProps) {
    const [recipient, setRecipient] = React.useState('');
    const [permission, setPermission] = React.useState(defaultPermission);
    const [success, setSuccess] = React.useState('');
    const [error, setError] = React.useState('');

    const handleDeliver = async (sendEmail: boolean) => {
      setError('');
      try {
        await onCreateInvite({
          recipient: recipient.trim(),
          permission,
          expiresInDays: defaultExpiresInDays,
          sendEmail,
        });
        setSuccess(
          successMessageFor?.({ recipient: recipient.trim(), sendEmail }) ??
            (sendEmail ? `Invite emailed to ${recipient.trim()}` : 'Invite link ready'),
        );
        setRecipient('');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create invite');
      }
    };

    return React.createElement(
      'div',
      null,
      React.createElement('input', {
        placeholder: recipientPlaceholder,
        value: recipient,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => setRecipient(e.target.value),
      }),
      React.createElement(
        'label',
        { htmlFor: 'stub-permission' },
        'Permission',
        React.createElement(
          'select',
          {
            id: 'stub-permission',
            value: permission,
            onChange: (e: React.ChangeEvent<HTMLSelectElement>) => setPermission(e.target.value),
          },
          permissions.map((p: string) =>
            React.createElement('option', { key: p, value: p }, permissionLabels[p] ?? p),
          ),
        ),
      ),
      error && React.createElement('p', null, error),
      success && React.createElement('p', null, success),
      React.createElement(
        'button',
        { type: 'button', onClick: () => handleDeliver(false) },
        'Copy link',
      ),
      React.createElement(
        'button',
        { type: 'button', onClick: () => handleDeliver(true) },
        'Email invite',
      ),
      React.createElement(
        'div',
        null,
        collaborators.length === 0
          ? React.createElement('p', null, 'No collaborators yet')
          : React.createElement(
              'div',
              null,
              React.createElement('p', null, `Collaborators (${collaborators.length})`),
              collaborators.map((c: Collaborator) =>
                React.createElement(
                  'div',
                  { key: c.accountId },
                  c.name,
                  React.createElement(
                    'button',
                    {
                      type: 'button',
                      'aria-label': `Remove ${c.name}`,
                      onClick: () => onRemoveCollaborator?.(c.accountId),
                    },
                    'Remove',
                  ),
                ),
              ),
            ),
      ),
      pendingInvites.length > 0 &&
        React.createElement(
          'div',
          null,
          React.createElement('p', null, `Pending Invites (${pendingInvites.length})`),
          pendingInvites.map((inv: PendingInvite) =>
            React.createElement(
              'div',
              { key: inv.token },
              inv.recipientEmail,
              React.createElement(
                'button',
                {
                  type: 'button',
                  'aria-label': 'Revoke invite',
                  onClick: () => onRevokeInvite?.(inv.token),
                },
                'Revoke',
              ),
            ),
          ),
        ),
    );
  }

  return { SharePanel };
});

const createInviteAndGrantAgent = vi.fn().mockResolvedValue({
  shareUrl: 'https://app/invite/tok',
  token: 'tok',
  agentAccountId: 'co_agent',
});
const mockGetCollaborators = vi.fn().mockResolvedValue([]);
const mockGetPendingInvites = vi.fn().mockResolvedValue([]);
const mockRemoveCollaborator = vi.fn().mockResolvedValue(true);
const mockRevokeInvite = vi.fn().mockResolvedValue(true);

vi.mock('@jbr-jazz/hierarchy-client', () => ({
  useSharing: () => ({
    createInviteAndGrantAgent,
    getCollaborators: mockGetCollaborators,
    getPendingInvites: mockGetPendingInvites,
    removeCollaborator: mockRemoveCollaborator,
    revokeInvite: mockRevokeInvite,
    error: null,
  }),
}));

import { ShareDialog } from '../ShareDialog';

const folder = { name: 'Groceries', $jazz: { id: 'co_zTest' } } as never;

beforeEach(() => {
  vi.clearAllMocks();
  createInviteAndGrantAgent.mockResolvedValue({
    shareUrl: 'https://app/invite/tok',
    token: 'tok',
    agentAccountId: 'co_agent',
  });
  mockGetCollaborators.mockResolvedValue([]);
  mockGetPendingInvites.mockResolvedValue([]);
  mockRemoveCollaborator.mockResolvedValue(true);
  mockRevokeInvite.mockResolvedValue(true);
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    configurable: true,
  });
  // ensure no Web Share API so Email invite button is present
  if ('share' in navigator) {
    // biome-ignore lint/suspicious/noExplicitAny: test cleanup
    delete (navigator as any).share;
  }
});

afterEach(() => {
  if ('share' in navigator) {
    // biome-ignore lint/suspicious/noExplicitAny: test cleanup
    delete (navigator as any).share;
  }
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
      expect(mockGetCollaborators).toHaveBeenCalledWith('co_zTest');
      expect(mockGetPendingInvites).toHaveBeenCalledWith('co_zTest');
    });
  });

  it('calls createInviteAndGrantAgent with correct 6-arg signature including expiresInDays', async () => {
    render(<ShareDialog open onOpenChange={() => {}} folder={folder} />);
    fireEvent.change(screen.getByPlaceholderText(/colleague@example.com/i), {
      target: { value: 'r@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /email invite/i }));
    await waitFor(() => expect(createInviteAndGrantAgent).toHaveBeenCalled());
    const args = createInviteAndGrantAgent.mock.calls[0];
    expect(args[0]).toMatchObject({ $jazz: { id: 'co_zTest' } }); // folder
    expect(args[1]).toBe('r@example.com');
    expect(args[2]).toMatch(/^(reader|writer|admin)$/);
    expect(args[3]).toBeUndefined();
    expect(args[4]).toBe(true); // sendEmail
    expect(typeof args[5]).toBe('number'); // expiresInDays
  });

  it('copy link sends sendEmail=false', async () => {
    render(<ShareDialog open onOpenChange={() => {}} folder={folder} />);
    fireEvent.change(screen.getByPlaceholderText(/colleague@example.com/i), {
      target: { value: 'r@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /copy link/i }));
    await waitFor(() => expect(createInviteAndGrantAgent).toHaveBeenCalled());
    expect(createInviteAndGrantAgent.mock.calls[0][4]).toBe(false);
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
      {
        userId: 'u1',
        accountId: 'co_u1',
        email: 'alice@example.com',
        name: 'Alice',
        permission: 'writer',
      },
    ]);
    render(<ShareDialog open onOpenChange={() => {}} folder={folder} />);
    await waitFor(() => expect(screen.getByText(/Collaborators \(1\)/)).toBeInTheDocument());
    expect(screen.getByText('Alice')).toBeInTheDocument();
  });

  it('calls removeCollaborator when remove is clicked', async () => {
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    (global as any).confirm = vi.fn().mockReturnValue(true);
    mockGetCollaborators.mockResolvedValue([
      {
        userId: 'u1',
        accountId: 'co_u1',
        email: 'alice@example.com',
        name: 'Alice',
        permission: 'writer',
      },
    ]);
    render(<ShareDialog open onOpenChange={() => {}} folder={folder} />);
    await waitFor(() => expect(screen.getByText('Alice')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Remove Alice/i }));
    await waitFor(() => expect(mockRemoveCollaborator).toHaveBeenCalledWith('co_zTest', 'co_u1'));
  });

  it('renders pending invites and calls revokeInvite on click', async () => {
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    (global as any).confirm = vi.fn().mockReturnValue(true);
    mockGetPendingInvites.mockResolvedValue([
      {
        token: 'test-token',
        recipientEmail: 'invited@example.com',
        permission: 'writer',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 7 * 86400_000).toISOString(),
      },
    ]);
    render(<ShareDialog open onOpenChange={() => {}} folder={folder} />);
    await waitFor(() => expect(screen.getByText('invited@example.com')).toBeInTheDocument());
    expect(screen.getByText(/Pending Invites \(1\)/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Revoke invite/i }));
    await waitFor(() => expect(mockRevokeInvite).toHaveBeenCalledWith('test-token'));
  });
});
