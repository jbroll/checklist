import { afterEach, describe, expect, it, vi } from 'vitest';
import { finalizeMerge, mergeInfo, prepareMerge, startMerge } from '../account-merge';

const mockFetch = (body: unknown, ok = true) =>
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok, json: async () => body } as Response);
afterEach(() => vi.restoreAllMocks());

describe('account-merge client', () => {
  it('startMerge posts and returns the nonce', async () => {
    const f = mockFetch({ nonce: 'n1' });
    expect(await startMerge()).toEqual({ nonce: 'n1' });
    expect(f).toHaveBeenCalledWith(
      '/api/account/merge/start',
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );
  });
  it('mergeInfo returns state + sourceEmail', async () => {
    mockFetch({ state: 'prepared', sourceEmail: 's@x.com' });
    expect(await mergeInfo('n1')).toEqual({ state: 'prepared', sourceEmail: 's@x.com' });
  });
  it('prepare/finalize post the nonce; a non-ok response throws', async () => {
    mockFetch({ success: true });
    await expect(prepareMerge('n1')).resolves.toBeUndefined();
    mockFetch({ success: true });
    await expect(finalizeMerge('n1')).resolves.toBeUndefined();
    mockFetch({ error: 'boom' }, false);
    await expect(finalizeMerge('n1')).rejects.toThrow('boom');
  });
});
