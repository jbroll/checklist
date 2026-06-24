import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const helpers = vi.hoisted(() => ({
  loadMergeState: vi.fn(),
  clearMergeState: vi.fn(),
  saveMergeState: vi.fn(),
  startMerge: vi.fn(),
  prepareMerge: vi.fn().mockResolvedValue(undefined),
  finalizeMerge: vi.fn().mockResolvedValue(undefined),
  shareTopLevelFoldersTo: vi.fn().mockResolvedValue(['co_f1']),
  adoptFolders: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/account-merge', () => helpers);
vi.mock('@/lib/auth-client', () => ({
  betterAuthClient: { signOut: vi.fn(), signIn: { social: vi.fn(), email: vi.fn() } },
}));
vi.mock('@/jazz', () => ({
  useAccount: () => ({ $jazz: { id: 'co_target' }, root: { folders: [] } }),
}));
vi.mock('@/schema', () => ({
  Account: {},
  ACCOUNT_RESOLVE: {},
}));

import MergeAccountFlow from '../MergeAccountFlow';

afterEach(() => vi.clearAllMocks());

describe('MergeAccountFlow', () => {
  it('on awaiting-target phase, adopts folders and finalizes', async () => {
    helpers.loadMergeState.mockReturnValue({
      nonce: 'n1',
      targetJazzId: 'co_target',
      sourceJazzId: 'co_source',
      adoptedFolderIds: ['co_f1'],
      phase: 'awaiting-target',
    });
    render(<MergeAccountFlow />);
    await waitFor(() =>
      expect(helpers.adoptFolders).toHaveBeenCalledWith(expect.anything(), ['co_f1'], 'co_source'),
    );
    expect(helpers.finalizeMerge).toHaveBeenCalledWith('n1');
    expect(helpers.clearMergeState).toHaveBeenCalled();
    expect(await screen.findByText(/merged|complete|success/i)).toBeInTheDocument();
  });
});
