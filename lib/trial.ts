// lib/trial.ts
// Server helper to check trial status for a workspace

import { createClient } from "@/lib/supabase/server";

export async function getTrialState() {
  const supabase = createClient();

  // 1) Get user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  // 2) Get workspace from workspace_members
  const { data: ws, error: wsErr } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (wsErr || !ws) return null;

  const workspaceId = ws.workspace_id;

  // 3) Get trial dates from workspaces table
  const { data: w, error: wErr } = await supabase
    .from("workspaces")
    .select("trial_start, trial_end")
    .eq("id", workspaceId)
    .maybeSingle();

  if (wErr || !w || !w.trial_start || !w.trial_end) return null;

  const now = new Date();
  const start = new Date(w.trial_start);
  const end = new Date(w.trial_end);

  const isActive = now < end;
  const isExpired = now >= end;

  const msLeft = end.getTime() - now.getTime();
  const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24));

  return {
    isActive,
    isExpired,
    trialStart: start,
    trialEnd: end,
    daysLeft: Math.max(daysLeft, 0),
  };
}


























































