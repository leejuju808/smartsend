import type { Tone } from "./policySegment";

export type { Tone };

/**
 * Resolves tone from a hierarchy: lastTone > rulePreferred > campaignPreferred > default
 */
export function resolveTone(opts: {
  lastTone: Tone | null;
  rulePreferred: Tone | null;
  campaignPreferred: Tone | null;
}): Tone {
  if (opts.lastTone) return opts.lastTone;
  if (opts.rulePreferred) return opts.rulePreferred;
  if (opts.campaignPreferred) return opts.campaignPreferred;
  return "formal"; // default
}















