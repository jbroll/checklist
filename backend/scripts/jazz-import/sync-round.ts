// syncWithServer resolves normally when the server answers 503/425 or schema_outdated, having pulled or
// pushed nothing. Its onTiming callback fires only when a round finishes both halves, so a round counts
// as complete only if that callback ran.
export async function syncUntilComplete(args: {
  runRound: (onComplete: () => void) => Promise<void>;
  label: string;
  attempts?: number;
  delayMs?: number;
  wait?: (ms: number) => Promise<void>;
}): Promise<void> {
  const attempts = args.attempts ?? 5;
  const delayMs = args.delayMs ?? 2000;
  const wait = args.wait ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  for (let attempt = 1; attempt <= attempts; attempt++) {
    let completed = false;
    await args.runRound(() => {
      completed = true;
    });
    if (completed) return;
    if (attempt < attempts) await wait(delayMs);
  }
  throw new Error(`${args.label} did not complete after ${attempts} attempts`);
}

export function assertNothingPending(pendingCreates: number, pendingOps: number, label: string): void {
  if (pendingCreates > 0 || pendingOps > 0) {
    throw new Error(`${label} left ${pendingCreates} create(s) and ${pendingOps} op(s) unpushed`);
  }
}
