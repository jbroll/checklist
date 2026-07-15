import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearMergeState,
  finalizeMerge,
  loadMergeState,
  mergeInfo,
  prepareMerge,
  saveMergeState,
  startMerge,
} from '../account-merge';

const mockFetch = (body: unknown, ok = true) =>
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok, json: async () => body } as Response);
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

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

  describe('merge state persistence', () => {
    it('saveMergeState stamps createdAt', () => {
      const before = Date.now();
      saveMergeState({ nonce: 'n1', phase: 'awaiting-source' });
      const after = Date.now();
      const raw = JSON.parse(localStorage.getItem('checklist:merge') as string);
      expect(raw.createdAt).toBeGreaterThanOrEqual(before);
      expect(raw.createdAt).toBeLessThanOrEqual(after);
    });

    it('loadMergeState returns fresh state', () => {
      saveMergeState({ nonce: 'n1', phase: 'awaiting-source' });
      expect(loadMergeState()).toEqual(
        expect.objectContaining({ nonce: 'n1', phase: 'awaiting-source' }),
      );
    });

    it('loadMergeState returns null and clears storage when state is older than 30 minutes', () => {
      const staleCreatedAt = Date.now() - 31 * 60 * 1000;
      localStorage.setItem(
        'checklist:merge',
        JSON.stringify({ nonce: 'old', phase: 'awaiting-target', createdAt: staleCreatedAt }),
      );

      expect(loadMergeState()).toBeNull();
      expect(localStorage.getItem('checklist:merge')).toBeNull();
    });

    it('loadMergeState returns state when just under 30 minutes old', () => {
      const freshCreatedAt = Date.now() - 29 * 60 * 1000;
      localStorage.setItem(
        'checklist:merge',
        JSON.stringify({ nonce: 'fresh', phase: 'awaiting-target', createdAt: freshCreatedAt }),
      );

      expect(loadMergeState()).toEqual(
        expect.objectContaining({ nonce: 'fresh', phase: 'awaiting-target' }),
      );
    });
  });

  it('clearMergeState removes the stored state', () => {
    saveMergeState({ nonce: 'n1', phase: 'awaiting-source' });
    clearMergeState();
    expect(loadMergeState()).toBeNull();
  });
});
