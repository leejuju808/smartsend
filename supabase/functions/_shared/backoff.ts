// Backoff utilities
// supabase/functions/_shared/backoff.ts

export function nextBackoff(attempts: number): number {
  // 1,2,4,8,16 minutes capped at 6h
  const minutes = Math.min(60*6, Math.pow(2, Math.max(0, attempts)) )
  return minutes
}

