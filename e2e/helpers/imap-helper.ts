/**
 * IMAP Helper — reads GreenMail (plain IMAP) for Playwright E2E tests.
 *
 * Shells to greenmail-imap.py (stdlib imaplib) rather than `imap-tool`, whose
 * --no-ssl path crashes against GreenMail. Reads IMAP_HOST / IMAP_PORT /
 * IMAP_USERNAME / IMAP_PASSWORD from env. In IMAP_PER_RECIPIENT mode (GreenMail)
 * each recipient has its own mailbox, so reads log in as the recipient address.
 */
import { execFileSync } from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'greenmail-imap.py');

interface ImapEmail {
  uid: number;
  subject: string;
  from: string;
  to: string;
  date: string;
}

export interface ImapEmailBody {
  uid: number;
  subject: string;
  from: string;
  to: string;
  date: string;
  body: string;
}

function imapEnv(mailboxUser?: string): NodeJS.ProcessEnv {
  const host = process.env.IMAP_HOST;
  const username = mailboxUser ?? process.env.IMAP_USERNAME;
  const password = process.env.IMAP_PASSWORD ?? 'greenmail';
  if (!host || !username) {
    throw new Error(
      'IMAP not configured: set IMAP_HOST, IMAP_USERNAME (and IMAP_PER_RECIPIENT for GreenMail)',
    );
  }
  return { ...process.env, IMAP_HOST: host, IMAP_USERNAME: username, IMAP_PASSWORD: password };
}

// biome-ignore lint/suspicious/noExplicitAny: JSON from the python reader is validated by callers
function py(args: string[], mailboxUser?: string): any {
  const out = execFileSync('python3', [SCRIPT, ...args], {
    env: imapEnv(mailboxUser),
    timeout: 20000,
  }).toString();
  const parsed = JSON.parse(out);
  if (parsed && parsed.error) throw new Error(`greenmail-imap: ${parsed.error}`);
  return parsed;
}

/** The mailbox to log into for a recipient: their own mailbox in per-recipient mode. */
export function mailboxFor(recipientEmail: string): string | undefined {
  return process.env.IMAP_PER_RECIPIENT ? recipientEmail : undefined;
}

export function listEmails(folder = 'INBOX', mailboxUser?: string): ImapEmail[] {
  return py(['emails', folder], mailboxUser) as ImapEmail[];
}

export function latestUid(recipientEmail: string): number {
  const mailbox = mailboxFor(recipientEmail);
  let max = 0;
  try {
    for (const email of listEmails('INBOX', mailbox)) if (email.uid > max) max = email.uid;
  } catch {
    // empty/absent mailbox — no high-water mark yet
  }
  return max;
}

export function readEmail(uid: number, folder = 'INBOX', mailboxUser?: string): ImapEmailBody {
  return py(['read', folder, String(uid)], mailboxUser) as ImapEmailBody;
}

/** better-auth verify links look like /api/auth/verify-email?token=...&callbackURL=... */
export function extractVerificationLink(emailBody: string): string | null {
  const match = emailBody.match(/https?:\/\/[^\s"<]+\/api\/auth\/verify-email\?[^\s"<]+/);
  return match?.[0] ?? null;
}

const SEARCH_FOLDERS = ['INBOX', 'Junk'];

export async function waitForEmail(
  subjectQuery: string,
  recipientEmail: string,
  { timeoutMs = 40000, pollMs = 3000, sinceUid = 0 } = {},
): Promise<ImapEmailBody> {
  const deadline = Date.now() + timeoutMs;
  const queryLower = subjectQuery.toLowerCase();
  const recipientLower = recipientEmail.toLowerCase();
  const mailbox = mailboxFor(recipientEmail);

  while (Date.now() < deadline) {
    for (const folder of SEARCH_FOLDERS) {
      try {
        const emails = listEmails(folder, mailbox);
        for (const email of [...emails].reverse()) {
          if (email.uid <= sinceUid) continue;
          if (!email.subject.toLowerCase().includes(queryLower)) continue;
          const body = readEmail(email.uid, folder, mailbox);
          if (body.to.toLowerCase().includes(recipientLower)) return body;
        }
      } catch {
        // folder may not exist (GreenMail typically only has INBOX)
      }
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
  throw new Error(`Timed out waiting for "${subjectQuery}" to ${recipientEmail} (${timeoutMs}ms)`);
}

export function deleteEmail(uid: number, folder = 'INBOX', mailboxUser?: string): void {
  py(['delete', folder, String(uid)], mailboxUser);
}
