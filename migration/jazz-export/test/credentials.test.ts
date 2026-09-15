import { symmetricEncrypt } from 'better-auth/crypto';
import { describe, expect, it } from 'vitest';
import { decryptCredentials } from '../src/credentials.js';

const SECRET = 'fixture-secret-fixture-secret-fixture';

describe('decryptCredentials', () => {
  it('reverses symmetricEncrypt with the auth secret', async () => {
    const creds = { accountID: 'co_zAccount', secretSeed: [1, 2, 3], accountSecret: 'sealerSecret_z/signerSecret_z', provider: 'better-auth' };
    const data = await symmetricEncrypt({ key: SECRET, data: JSON.stringify(creds) });
    await expect(decryptCredentials(data, SECRET)).resolves.toEqual(creds);
  });

  it('fails with the wrong secret', async () => {
    const data = await symmetricEncrypt({ key: SECRET, data: JSON.stringify({ accountID: 'a', accountSecret: 'b' }) });
    await expect(decryptCredentials(data, 'another-secret-another-secret-another')).rejects.toThrow();
  });

  it('rejects credentials missing accountID or accountSecret', async () => {
    const data = await symmetricEncrypt({ key: SECRET, data: JSON.stringify({ accountID: 'a' }) });
    await expect(decryptCredentials(data, SECRET)).rejects.toThrow('accountSecret');
  });
});
