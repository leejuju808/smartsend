/**
 * Feature flags for controlling marketplace monetization
 */
import { LAUNCH_MODE } from "@/lib/launch-mode";

export const FEATURE_FLAGS = {
  MARKETPLACE_MONETIZATION: process.env.MARKETPLACE_MONETIZATION_ENABLED === 'true',
  // BLOCK 281000 — SmartSend v1 Freeze
  // Sales mode is ON by default to prevent feature creep and present v1 as complete.
  // To disable locally, set NEXT_PUBLIC_SALES_MODE=false
  // BLOCK 290000 — Launch Discipline: when launch mode is on, SALES_MODE is locked ON.
  SALES_MODE:
    LAUNCH_MODE ||
    String(process.env.NEXT_PUBLIC_SALES_MODE ?? process.env.SALES_MODE ?? "true") === "true",
  /**
   * BLOCK 272500 — Internalization Sprint
   * Coaching UI (tooltips, tours, tutorials, onboarding walkthroughs).
   *
   * Default: OFF. Re-enable only with explicit env override for QA/dev.
   * Set NEXT_PUBLIC_COACHING_UI=true to enable.
   */
  COACHING_UI:
    String(process.env.NEXT_PUBLIC_COACHING_UI ?? process.env.COACHING_UI ?? "false") === "true",
} as const;

/**
 * Check if marketplace monetization is enabled
 */
export function isMarketplaceMonetizationEnabled(): boolean {
  return FEATURE_FLAGS.MARKETPLACE_MONETIZATION;
}

/**
 * BLOCK 281000 — SmartSend v1 Freeze
 * When enabled: hide "coming soon", remove internal notes, disable demo/dev toggles.
 */
export function isSalesModeEnabled(): boolean {
  return FEATURE_FLAGS.SALES_MODE;
}

/**
 * BLOCK 272500 — Internalization Sprint
 * When disabled: no tooltips, no tours, no onboarding walkthrough UI.
 */
export function isCoachingUIEnabled(): boolean {
  return FEATURE_FLAGS.COACHING_UI;
}

/**
 * Get all feature flags (for debugging/admin)
 */
export function getFeatureFlags() {
  return { ...FEATURE_FLAGS };
} 