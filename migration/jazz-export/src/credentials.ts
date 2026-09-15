import { symmetricDecrypt } from 'better-auth/crypto';

export interface JazzCredentials {
  accountID: string;
  accountSecret: string;
  secretSeed?: unknown;
  provider?: string;
}

export async function decryptCredentials(encrypted: string, secret: string): Promise<JazzCredentials> {
  const parsed = JSON.parse(await symmetricDecrypt({ key: secret, data: encrypted })) as Partial<JazzCredentials>;
  if (typeof parsed.accountID !== 'string') throw new Error('credentials missing accountID');
  if (typeof parsed.accountSecret !== 'string') throw new Error('credentials missing accountSecret');
  return parsed as JazzCredentials;
}
