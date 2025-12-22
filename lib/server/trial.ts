// lib/server/trial.ts
// Trial mode helper functions

export function isTrialActive(workspace: {
  is_trial_active: boolean;
  trial_ends_at: string | null;
}): boolean {
  if (!workspace.is_trial_active || !workspace.trial_ends_at) return false;
  const now = new Date();
  return now < new Date(workspace.trial_ends_at);
}
















