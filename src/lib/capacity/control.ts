export type DemandThrottle = "low" | "normal" | "high";

export function normalizeDemandThrottle(v: unknown): DemandThrottle {
  const s = String(v || "normal").toLowerCase();
  if (s === "low") return "low";
  if (s === "high") return "high";
  return "normal";
}

export function nonNegativeIntOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v));
  if (!Number.isFinite(n)) return null;
  const i = Math.floor(n);
  return i >= 0 ? i : null;
}

export function throttleDailyCap(throttle: DemandThrottle): number {
  // Mechanical defaults; tuned for simplicity.
  if (throttle === "low") return 25;
  if (throttle === "high") return 100;
  return 50;
}

export function throttlePerRunLimit(throttle: DemandThrottle): number {
  // Smooth burstiness of the worker; daily cap is enforced separately.
  if (throttle === "low") return 10;
  if (throttle === "high") return 50;
  return 25;
}

export function isCapacityFull(openJobs: number, crewCapacityJobs: number | null): boolean {
  if (crewCapacityJobs === null) return false;
  const cap = Math.max(0, Math.floor(crewCapacityJobs));
  if (cap <= 0) return false;
  return Math.max(0, Math.floor(openJobs || 0)) >= cap;
}

export function fullSignalMessage(isFull: boolean): string | null {
  return isFull ? "Demand exceeds availability." : null;
}





