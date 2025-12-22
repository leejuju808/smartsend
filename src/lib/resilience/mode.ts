import type { DemandThrottle } from "@/lib/capacity/control";

export type ResilienceMode = "normal" | "storm" | "surge";

export function normalizeResilienceMode(v: unknown): ResilienceMode {
  const s = String(v || "normal").toLowerCase().trim();
  if (s === "storm") return "storm";
  if (s === "surge") return "surge";
  return "normal";
}

export function throttleForResilienceMode(mode: ResilienceMode): DemandThrottle {
  // No-thinking defaults:
  // - storm: protect ops + deliverability
  // - surge: controlled higher volume
  if (mode === "storm") return "low";
  if (mode === "surge") return "high";
  return "normal";
}

export function followupDelayMultiplierForResilienceMode(mode: ResilienceMode): number {
  if (mode === "storm") return 2;
  if (mode === "surge") return 1.5;
  return 1;
}



