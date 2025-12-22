// Simple capped exponential backoff with jitter (in seconds)

export function computeBackoffSeconds(attempts: number, kind: "transient"|"hard"|"unknown" = "transient") {
  // attempts is the *new* attempts count you're about to try, so base on current attempts
  const base = Math.min(attempts, 8); // cap exponent growth
  
  let secs = Math.pow(2, base) * 15; // 15s, 30s, 60s, 120s, ...
  
  if (kind !== "transient") secs *= 3; // be extra cautious on unknown/hard
  
  const jitter = Math.floor(Math.random() * Math.min(60, secs * 0.1)); // ≤10% jitter up to 60s
  
  return Math.min(secs + jitter, 6 * 60 * 60); // cap at 6h
}

