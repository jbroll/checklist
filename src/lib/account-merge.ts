const MERGE_KEY = 'checklist:merge';
const MERGE_STATE_TTL_MS = 30 * 60 * 1000;

export interface MergeState {
  nonce: string;
  phase: 'awaiting-source' | 'awaiting-target';
  createdAt?: number;
}

export function saveMergeState(s: { nonce: string; phase: MergeState['phase'] }): void {
  const state: MergeState = { ...s, createdAt: Date.now() };
  localStorage.setItem(MERGE_KEY, JSON.stringify(state));
}
export function loadMergeState(): MergeState | null {
  const raw = localStorage.getItem(MERGE_KEY);
  if (!raw) return null;
  const state = JSON.parse(raw) as MergeState;
  if (state.createdAt && Date.now() - state.createdAt > MERGE_STATE_TTL_MS) {
    localStorage.removeItem(MERGE_KEY);
    return null;
  }
  return state;
}
export function clearMergeState(): void {
  localStorage.removeItem(MERGE_KEY);
}

async function postJson(url: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
    body: JSON.stringify(body ?? {}),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error((data.error as string) || `Request failed: ${res.status}`);
  return data;
}

export async function startMerge(): Promise<{ nonce: string }> {
  const d = await postJson('/api/account/merge/start', {});
  return { nonce: d.nonce as string };
}
export async function prepareMerge(nonce: string): Promise<void> {
  await postJson('/api/account/merge/prepare', { nonce });
}
export async function mergeInfo(
  nonce: string,
): Promise<{ state: string; sourceEmail: string | null }> {
  const d = await postJson('/api/account/merge/info', { nonce });
  return { state: d.state as string, sourceEmail: (d.sourceEmail as string | null) ?? null };
}
export async function finalizeMerge(nonce: string): Promise<void> {
  await postJson('/api/account/merge/finalize', { nonce });
}
