// lib/billing/limits.ts
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function canWorkspaceSendEmail(
  workspaceId: string,
  supabaseClient?: SupabaseClient
) {
  const supabase = supabaseClient || createClient();

  const { data: ws, error } = await supabase
    .from("workspaces")
    .select("plan_key, email_limit_monthly, email_used_this_period, billing_period_ends_at")
    .eq("id", workspaceId)
    .single();

  if (error || !ws) return { ok: false, reason: "workspace_not_found" };

  const now = new Date();
  const periodEnds = ws.billing_period_ends_at
    ? new Date(ws.billing_period_ends_at)
    : null;

  // If period ended but Stripe hasn't pinged yet, soft reset
  let used = ws.email_used_this_period ?? 0;
  let limit = ws.email_limit_monthly ?? 0;

  if (periodEnds && now > periodEnds) {
    used = 0;
  }

  if (limit === 0) {
    // free/unlimited fallback
    limit = 100;
  }

  if (used >= limit) {
    return { ok: false, reason: "limit_reached" };
  }

  return {
    ok: true,
    remaining: limit - used,
  };
}

export async function incrementWorkspaceEmailUsage(
  workspaceId: string,
  count: number,
  supabaseClient?: SupabaseClient
) {
  const supabase = supabaseClient || createClient();

  await supabase.rpc("increment_email_usage", {
    p_workspace_id: workspaceId,
    p_count: count,
  });
}

