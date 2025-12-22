// lib/planUsage.ts
import { createClient } from "@/lib/supabase/server";
import { PLAN_CONFIG, PlanKey } from "@/lib/planConfig";
import { effectivePlan } from "@/lib/server/planLimits";

export async function canSendEmails(
  workspaceId: string,
  requestedCount: number
): Promise<{
  allowed: boolean;
  reason?: string;
  willExceed?: boolean;
  remaining?: number | null;
  limit?: number | null;
}> {
  const supabase = createClient();

  const { data: ws, error } = await supabase
    .from("workspaces")
    .select("id, plan_key, plan_emails_sent_this_period, plan_period_start, plan_period_end, is_trial_active, trial_ends_at")
    .eq("id", workspaceId)
    .single();

  if (error || !ws) {
    return { allowed: false, reason: "Workspace not found" };
  }

  // Use effective plan (trial-aware)
  const effectivePlanKey = effectivePlan({
    plan_key: ws.plan_key,
    is_trial_active: ws.is_trial_active || false,
    trial_ends_at: ws.trial_ends_at,
  });
  const planKey = effectivePlanKey as PlanKey;
  const config = PLAN_CONFIG[planKey];

  // If no limit (null), always allow
  if (config.monthlyEmailLimit == null) {
    return {
      allowed: true,
      remaining: null,
      limit: null,
      willExceed: false,
    };
  }

  const used = ws.plan_emails_sent_this_period || 0;
  const limit = config.monthlyEmailLimit;
  const remaining = Math.max(limit - used, 0);

  if (requestedCount > remaining) {
    return {
      allowed: false,
      reason: `This send would exceed your monthly limit (${limit.toLocaleString()} emails for the ${config.name} plan).`,
      remaining,
      limit,
      willExceed: true,
    };
  }

  return {
    allowed: true,
    remaining,
    limit,
    willExceed: requestedCount > remaining * 0.2, // near top 20%
  };
}

export async function incrementEmailUsage(
  workspaceId: string,
  incrementBy: number
) {
  const supabase = createClient();
  await supabase.rpc("increment_workspace_email_usage", {
    p_workspace_id: workspaceId,
    p_increment: incrementBy,
  });
}

// Block 15400: AI Personalization limits
export async function canUseAIPersonalization(
  workspaceId: string
): Promise<{
  allowed: boolean;
  reason?: string;
  remaining?: number | null;
  limit?: number | null;
}> {
  const supabase = createClient();

  const { data: ws, error } = await supabase
    .from("workspaces")
    .select("id, plan_key, ai_personalizations_this_period, is_trial_active, trial_ends_at")
    .eq("id", workspaceId)
    .single();

  if (error || !ws) {
    return { allowed: false, reason: "Workspace not found" };
  }

  // Use effective plan (trial-aware)
  const effectivePlanKey = effectivePlan({
    plan_key: ws.plan_key,
    is_trial_active: ws.is_trial_active || false,
    trial_ends_at: ws.trial_ends_at,
  });
  const planKey = effectivePlanKey as PlanKey;
  const config = PLAN_CONFIG[planKey];

  // If no limit (null), always allow
  if (config.aiPersonalizationLimit == null) {
    return {
      allowed: true,
      remaining: null,
      limit: null,
    };
  }

  const used = ws.ai_personalizations_this_period || 0;
  const limit = config.aiPersonalizationLimit;
  const remaining = Math.max(limit - used, 0);

  if (remaining <= 0) {
    return {
      allowed: false,
      reason: `AI personalization limit reached (${limit.toLocaleString()} per month for the ${config.name} plan). Upgrade to unlock more.`,
      remaining: 0,
      limit,
    };
  }

  return {
    allowed: true,
    remaining,
    limit,
  };
}

