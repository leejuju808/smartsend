// lib/getWorkspacePlan.ts
import { createClient } from "@/lib/supabase/server";
import { PLAN_CONFIG, PlanConfig, PlanKey } from "@/lib/planConfig";
import { effectivePlan } from "@/lib/server/planLimits";

export async function getWorkspaceAndPlan() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Unauthorized");

  // Try to get default workspace first, fallback to first workspace
  let membership: any = null;
  
  // Check if is_default column exists by trying to query it
  const { data: defaultMembership } = await supabase
    .from("workspace_members")
    .select("workspace_id, workspaces(plan_key, plan_emails_sent_this_period, plan_period_start, plan_period_end, is_trial_active, trial_ends_at)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!defaultMembership) {
    throw new Error("No workspace found");
  }

  membership = defaultMembership;

  const workspaceId = membership.workspace_id;
  const ws = membership.workspaces as any;
  
  // Use effective plan (trial-aware)
  const effectivePlanKey = effectivePlan({
    plan_key: ws?.plan_key,
    is_trial_active: ws?.is_trial_active || false,
    trial_ends_at: ws?.trial_ends_at,
  });
  const planKey = effectivePlanKey as PlanKey;
  const planConfig: PlanConfig = PLAN_CONFIG[planKey];

  return {
    workspaceId,
    workspace: ws,
    planKey,
    planConfig,
  };
}

