import { describe, expect, it } from 'vitest';
import { assertNothingPending, syncUntilComplete } from '../../scripts/jazz-import/sync-round.js';

const noWait = async () => {};

describe('syncUntilComplete', () => {
  it('returns after the first round that completes', async () => {
    let rounds = 0;
    await syncUntilComplete({
      label: 'user u1 first sync',
      wait: noWait,
      runRound: async (onComplete) => {
        rounds += 1;
        if (rounds === 3) onComplete();
      },
    });
    expect(rounds).toBe(3);
  });

  it('throws naming the sync when no round completes within the attempts', async () => {
    let rounds = 0;
    const waits: number[] = [];
    await expect(
      syncUntilComplete({
        label: 'user u1 post-write sync',
        attempts: 5,
        delayMs: 10,
        wait: async (ms) => {
          waits.push(ms);
        },
        runRound: async () => {
          rounds += 1;
        },
      }),
    ).rejects.toThrow('user u1 post-write sync did not complete after 5 attempts');
    expect(rounds).toBe(5);
    expect(waits).toEqual([10, 10, 10, 10]);
  });

  it('propagates a round that throws without retrying', async () => {
    let rounds = 0;
    await expect(
      syncUntilComplete({
        label: 'x',
        wait: noWait,
        runRound: async () => {
          rounds += 1;
          throw new Error('Pull failed: 401');
        },
      }),
    ).rejects.toThrow('Pull failed: 401');
    expect(rounds).toBe(1);
  });
});

describe('assertNothingPending', () => {
  it('passes when nothing is left to push', () => {
    expect(() => assertNothingPending(0, 0, 'user u1')).not.toThrow();
  });

  it('throws when creates or ops remain', () => {
    expect(() => assertNothingPending(2, 0, 'user u1')).toThrow('user u1 left 2 create(s) and 0 op(s) unpushed');
    expect(() => assertNothingPending(0, 1, 'user u1')).toThrow('user u1 left 0 create(s) and 1 op(s) unpushed');
  });
});
