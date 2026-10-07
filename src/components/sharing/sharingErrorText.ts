import { SharingError } from '@jbroll/rowboat-sharing-react';

// The server's own wording stays in its log; the user gets something quotable in a bug report.
export function withErrorCode(message: string, err: Error | null): string {
  if (!(err instanceof SharingError)) return message;
  return `${message} (${err.code ?? err.status})`;
}

export function logSharingError(context: string, err: Error | null): void {
  if (err) console.error(`[sharing] ${context}:`, err);
}
