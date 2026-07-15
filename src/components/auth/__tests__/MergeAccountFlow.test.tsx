import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const helpers = vi.hoisted(() => ({
  loadMergeState: vi.fn(),
  clearMergeState: vi.fn(),
  saveMergeState: vi.fn(),
  startMerge: vi.fn(),
  prepareMerge: vi.fn().mockResolvedValue(undefined),
  mergeInfo: vi.fn(),
  finalizeMerge: vi.fn().mockResolvedValue(undefined),
}));

let mockAuthor: string | null = 'user-target';
let mockSessionPending = false;

vi.mock('@/lib/account-merge', () => helpers);
vi.mock('@/lib/auth-client', () => ({
  betterAuthClient: { signOut: vi.fn(), signIn: { social: vi.fn(), email: vi.fn() } },
}));
vi.mock('@/jazz', () => ({
  useAuthor: () => mockAuthor,
  useSession: () => ({ isPending: mockSessionPending }),
}));

import MergeAccountFlow from '../MergeAccountFlow';

afterEach(() => {
  vi.clearAllMocks();
  mockAuthor = 'user-target';
  mockSessionPending = false;
  window.history.replaceState({}, '', '/');
});

describe('MergeAccountFlow confirm gate', () => {
  it('shows source email and requires confirm before finalize', async () => {
    window.history.replaceState({}, '', '/?merge=n1');
    helpers.loadMergeState.mockReturnValue({ nonce: 'n1', phase: 'awaiting-target' });
    helpers.mergeInfo.mockResolvedValue({ state: 'prepared', sourceEmail: 's@x.com' });

    render(<MergeAccountFlow />);

    expect(await screen.findByText(/s@x\.com/)).toBeInTheDocument();
    expect(helpers.finalizeMerge).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: /confirm|combine|finish/i }));

    await waitFor(() => expect(helpers.finalizeMerge).toHaveBeenCalledWith('n1'));
    expect(helpers.clearMergeState).toHaveBeenCalled();
    expect(await screen.findByText(/merged|complete|success/i)).toBeInTheDocument();
  });

  it('shows a generic label when sourceEmail is null', async () => {
    window.history.replaceState({}, '', '/?merge=n2');
    helpers.loadMergeState.mockReturnValue({ nonce: 'n2', phase: 'awaiting-target' });
    helpers.mergeInfo.mockResolvedValue({ state: 'prepared', sourceEmail: null });

    render(<MergeAccountFlow />);

    expect(
      await screen.findByRole('button', { name: /confirm|combine|finish/i }),
    ).toBeInTheDocument();
    expect(helpers.finalizeMerge).not.toHaveBeenCalled();
  });

  it('advances from awaiting-source to awaiting-target after prepareMerge', async () => {
    window.history.replaceState({}, '', '/?merge=n3');
    helpers.loadMergeState.mockReturnValue({ nonce: 'n3', phase: 'awaiting-source' });

    render(<MergeAccountFlow />);

    await waitFor(() => expect(helpers.prepareMerge).toHaveBeenCalledWith('n3'));
    expect(helpers.saveMergeState).toHaveBeenCalledWith({ nonce: 'n3', phase: 'awaiting-target' });
    expect(await screen.findByText(/sign back into your main account/i)).toBeInTheDocument();
  });

  it('shows the error screen when a step throws', async () => {
    window.history.replaceState({}, '', '/?merge=n4');
    helpers.loadMergeState.mockReturnValue({ nonce: 'n4', phase: 'awaiting-target' });
    helpers.mergeInfo.mockRejectedValue(new Error('accounts already merged'));

    render(<MergeAccountFlow />);

    expect(await screen.findByText(/accounts already merged/i)).toBeInTheDocument();
    expect(helpers.finalizeMerge).not.toHaveBeenCalled();
  });
});
