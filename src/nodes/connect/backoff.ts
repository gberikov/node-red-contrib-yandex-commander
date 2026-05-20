/**
 * Экспоненциальный backoff с full-jitter (decorrelated jitter, AWS-style):
 *   attempt 1 → ~5s
 *   attempt 2 → ~10s
 *   attempt 3 → ~20s
 *   attempt 4 → ~40s
 *   attempt 5+ → ~60s (cap)
 *
 * Каждое значение умножается на random в диапазоне [1 - JITTER, 1 + JITTER],
 * чтобы избежать «громового стада» при одновременном падении нескольких устройств.
 */
const BASE_MS = 5_000;
const CAP_MS = 60_000;
const JITTER = 0.25;

export function nextBackoffMs(attempt: number, rng: () => number = Math.random): number {
  const exp = Math.min(BASE_MS * 2 ** Math.max(0, attempt - 1), CAP_MS);
  const jitterFactor = 1 + (rng() * 2 - 1) * JITTER;
  return Math.max(1_000, Math.round(exp * jitterFactor));
}
