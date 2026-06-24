import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const createInviteAndGrantAgent = vi.fn().mockResolvedValue({
  shareUrl: 'https://app/invite/tok',
  token: 'tok',
  agentAccountId: 'co_agent',
});

vi.mock('@jbr-jazz/hierarchy-client', () => ({
  useSharing: () => ({
    createInviteAndGrantAgent,
    getCollaborators: vi.fn().mockResolvedValue([]),
    getPendingInvites: vi.fn().mockResolvedValue([]),
    removeCollaborator: vi.fn(),
    revokeInvite: vi.fn(),
    error: null,
  }),
}));

import { ShareDialog } from '../ShareDialog';

const folder = { name: 'Groceries', $jazz: { id: 'co_zTest' } } as never;

function setShareCapability(present: boolean) {
  if (present) {
    Object.defineProperty(navigator, 'share', {
      value: vi.fn().mockResolvedValue(undefined),
      configurable: true,
    });
  } else if ('share' in navigator) {
    // @ts-expect-error test cleanup
    delete navigator.share;
  }
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    configurable: true,
  });
}

afterEach(() => {
  createInviteAndGrantAgent.mockClear();
  if ('share' in navigator) {
    // @ts-expect-error test cleanup
    delete navigator.share;
  }
});

describe('ShareDialog delivery row', () => {
  it('desktop (no Web Share): shows Email invite, sends with sendEmail=true', async () => {
    setShareCapability(false);
    render(<ShareDialog open onOpenChange={() => {}} folder={folder} />);
    expect(screen.queryByRole('button', { name: /share/i })).toBeNull();
    const email = screen.getByPlaceholderText(/colleague@example.com/i);
    fireEvent.change(email, { target: { value: 'r@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /email invite/i }));
    await waitFor(() => expect(createInviteAndGrantAgent).toHaveBeenCalled());
    const args = createInviteAndGrantAgent.mock.calls[0];
    expect(args[1]).toBe('r@example.com');
    expect(args[4]).toBe(true); // sendEmail
  });

  it('mobile (Web Share): shows Share, shares with sendEmail=false', async () => {
    setShareCapability(true);
    render(<ShareDialog open onOpenChange={() => {}} folder={folder} />);
    expect(screen.queryByRole('button', { name: /email invite/i })).toBeNull();
    const email = screen.getByPlaceholderText(/colleague@example.com/i);
    fireEvent.change(email, { target: { value: 'r@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /^share$/i }));
    await waitFor(() => expect(createInviteAndGrantAgent).toHaveBeenCalled());
    expect(createInviteAndGrantAgent.mock.calls[0][4]).toBe(false); // sendEmail
    expect(navigator.share).toHaveBeenCalled();
  });

  it('Copy never sends email (sendEmail=false)', async () => {
    setShareCapability(false);
    render(<ShareDialog open onOpenChange={() => {}} folder={folder} />);
    fireEvent.change(screen.getByPlaceholderText(/colleague@example.com/i), {
      target: { value: 'r@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /copy link/i }));
    await waitFor(() => expect(createInviteAndGrantAgent).toHaveBeenCalled());
    expect(createInviteAndGrantAgent.mock.calls[0][4]).toBe(false);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://app/invite/tok');
  });
});
