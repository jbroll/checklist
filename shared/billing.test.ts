import { describe, expect, it } from 'vitest';
import {
  assertTier,
  DEFAULT_TIER_LIMITS,
  getEffectiveTier,
  getTierDisplayName,
  isPaidTier,
} from './billing.js';

describe('assertTier', () => {
  it('returns known slugs unchanged', () => {
    expect(assertTier('free')).toBe('free');
    expect(assertTier('enterprise')).toBe('enterprise');
  });

  it('THROWS on an unrecognized slug rather than downgrading to free', () => {
    expect(() => assertTier('gold')).toThrow(/unknown subscription tier: gold/i);
    expect(() => assertTier('')).toThrow(/unknown subscription tier/i);
  });
});

describe('getEffectiveTier', () => {
  it('grants Plus limits to beta users regardless of tier', () => {
    expect(getEffectiveTier('free', 'beta')).toBe('plus');
    expect(getEffectiveTier('premium', 'beta')).toBe('plus');
  });

  it('drops past_due and cancelled to free', () => {
    expect(getEffectiveTier('premium', 'past_due')).toBe('free');
    expect(getEffectiveTier('premium', 'cancelled')).toBe('free');
  });

  it('passes an active tier through', () => {
    expect(getEffectiveTier('premium', 'active')).toBe('premium');
    expect(getEffectiveTier('plus', undefined)).toBe('plus');
  });

  it('THROWS on an unrecognized tier', () => {
    expect(() => getEffectiveTier('gold' as never, 'active')).toThrow(/unknown subscription tier/i);
  });
});

describe('DEFAULT_TIER_LIMITS', () => {
  it('keeps -1 as the designed unlimited sentinel for enterprise', () => {
    expect(DEFAULT_TIER_LIMITS.enterprise).toEqual({ maxItems: -1, retentionDays: -1 });
  });

  it('preserves the pre-port numbers for every tier', () => {
    expect(DEFAULT_TIER_LIMITS.free).toEqual({ maxItems: 3, retentionDays: 7 });
    expect(DEFAULT_TIER_LIMITS.plus).toEqual({ maxItems: 30, retentionDays: 30 });
    expect(DEFAULT_TIER_LIMITS.premium).toEqual({ maxItems: 300, retentionDays: 365 });
  });
});

describe('display helpers', () => {
  it('names every tier', () => {
    expect(getTierDisplayName('free')).toBe('Free');
    expect(getTierDisplayName('plus')).toBe('Plus');
    expect(getTierDisplayName('premium')).toBe('Premium');
    expect(getTierDisplayName('enterprise')).toBe('Enterprise');
  });

  it('treats every non-free tier as paid', () => {
    expect(isPaidTier('free')).toBe(false);
    expect(isPaidTier('plus')).toBe(true);
  });

  it('THROWS naming an unrecognized tier', () => {
    expect(() => getTierDisplayName('gold' as never)).toThrow(/unknown subscription tier/i);
  });
});
