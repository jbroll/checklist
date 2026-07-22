import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSyncToken, getSyncToken } from '../syncToken';

// A JWT is only parsed for `exp` here, so a real signature is unnecessary.
function jwtExpiringIn(seconds: number): string {
  const payload = btoa(JSON.stringify({ sub: 'u1', exp: Math.floor(Date.now() / 1000) + seconds }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `header.${payload}.sig`;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  clearSyncToken();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function okToken(token: string) {
  return { ok: true, json: async () => ({ token }) } as unknown as Response;
}

describe('getSyncToken', () => {
  it('mints once and serves the cached token while it is fresh', async () => {
    fetchMock.mockResolvedValue(okToken(jwtExpiringIn(900)));

    const first = await getSyncToken();
    const second = await getSyncToken();

    expect(second).toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/auth/token');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: 'include' });
  });

  it('re-mints inside the 60s expiry margin', async () => {
    fetchMock.mockResolvedValueOnce(okToken(jwtExpiringIn(30)));
    const first = await getSyncToken();

    const fresh = jwtExpiringIn(900);
    fetchMock.mockResolvedValueOnce(okToken(fresh));
    const second = await getSyncToken();

    expect(second).toBe(fresh);
    expect(second).not.toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws on a non-ok response rather than yielding a blank token', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401 } as unknown as Response);
    await expect(getSyncToken()).rejects.toThrow(/401/);
  });

  it('throws when the response carries no token', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) } as unknown as Response);
    await expect(getSyncToken()).rejects.toThrow(/missing a token/);
  });

  it('throws on a JWT with no numeric exp', async () => {
    const noExp = `header.${btoa(JSON.stringify({ sub: 'u1' }))}.sig`;
    fetchMock.mockResolvedValue(okToken(noExp));
    await expect(getSyncToken()).rejects.toThrow(/exp/);
  });
});
