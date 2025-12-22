export function nextRetry(attempts: number): { delayMs: number; giveUp: boolean } {
  // attempts is current attempts BEFORE this retry (0-based)
  const MAX = 5; // total tries
  if (attempts >= MAX) return { delayMs: 0, giveUp: true };
  // exponential backoff with jitter: 2^attempt * 5m (capped 24h)
  const base = Math.min(24 * 60, Math.pow(2, attempts) * 5); // minutes
  const jitter = Math.floor(Math.random() * 5); // 0–4 minutes
  return { delayMs: (base + jitter) * 60 * 1000, giveUp: false };
}