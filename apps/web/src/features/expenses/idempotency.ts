import { randomIdempotencyKey } from "./money";

export function expenseDraftFingerprint(input: unknown): string {
  return JSON.stringify(input);
}

export function createIdempotencyKeyTracker(
  generate: () => string = randomIdempotencyKey,
) {
  let pending: { fingerprint: string; key: string } | undefined;
  return {
    forInput(input: unknown): string {
      const fingerprint = expenseDraftFingerprint(input);
      if (pending?.fingerprint !== fingerprint)
        pending = { fingerprint, key: generate() };
      return pending.key;
    },
    reset(): void {
      pending = undefined;
    },
  };
}
