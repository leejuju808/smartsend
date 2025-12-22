// lib/deliverability/warmupCurve.ts
// Warmup curve constants and utilities

/**
 * Warmup curve: Daily max sends per warmup level
 * Day 1: 10, Day 2: 20, Day 3: 30, ..., Day 10: 200
 */
export const WARMUP_CURVE = [10, 20, 30, 40, 60, 80, 100, 120, 150, 200] as const;

/**
 * Maximum warmup level (index of last element)
 */
export const MAX_WARMUP_LEVEL = WARMUP_CURVE.length;

/**
 * Get warmup limit for a given warmup level
 * @param warmupLevel 1-indexed warmup level
 * @returns Daily send limit for that level
 */
export function getWarmupLimit(warmupLevel: number): number {
  if (warmupLevel < 1) {
    return WARMUP_CURVE[0];
  }
  if (warmupLevel > MAX_WARMUP_LEVEL) {
    return WARMUP_CURVE[MAX_WARMUP_LEVEL - 1];
  }
  return WARMUP_CURVE[warmupLevel - 1];
}

/**
 * Get effective daily limit considering warmup
 * @param sendLimitDaily Base daily limit
 * @param warmupActive Whether warmup is active
 * @param warmupLevel Current warmup level
 * @returns Effective daily limit
 */
export function getEffectiveDailyLimit(
  sendLimitDaily: number,
  warmupActive: boolean,
  warmupLevel: number
): number {
  if (!warmupActive) {
    return sendLimitDaily;
  }
  const warmupLimit = getWarmupLimit(warmupLevel);
  return Math.min(sendLimitDaily, warmupLimit);
}










