/**
 * BLOCK 290000 — SmartSend Launch Discipline v1
 * Global "launch mode" lock. Default: ON.
 *
 * Philosophy: revenue/execution > product work. Guardrails should be hard to bypass,
 * but still allow explicit emergency overrides via env for production operations.
 */
export const LAUNCH_MODE =
  String(process.env.NEXT_PUBLIC_LAUNCH_MODE ?? process.env.LAUNCH_MODE ?? "true") === "true";

/**
 * Explicit bypass for operational emergencies (e.g., production hotfix migrations).
 * Keep this OFF by default.
 */
export const LAUNCH_MODE_BYPASS =
  String(process.env.LAUNCH_MODE_BYPASS ?? "false") === "true";

export const LAUNCH_TARGETS = Object.freeze({
  outboundEmailsPerDay: 25,
  demosPerDay: 1,
  trialsPerDay: 1,
});









