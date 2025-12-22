import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { PLAN_CONFIG, PlanKey } from "@/lib/planConfig";

export async function GET() {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get workspace membership
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id, workspaces(plan_key, plan_emails_sent_this_period, plan_period_start, plan_period_end, is_trial_active, trial_ends_at)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!membership) {
      return NextResponse.json({ error: "No workspace found" }, { status: 404 });
    }

    const workspaceId = membership.workspace_id;
    const ws = membership.workspaces as any;
    const planKey = (ws?.plan_key || "starter") as PlanKey;
    const planConfig = PLAN_CONFIG[planKey];

    // Get plan limits from plan_limits table (matching migration 21532)
    const { data: planLimits } = await supabase
      .from("plan_limits")
      .select("*")
      .eq("tier", planKey)
      .maybeSingle();

    // Get campaign count
    const { count: campaignCount } = await supabase
      .from("campaigns")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .in("status", ["active", "scheduled", "running", "paused"]);

    // Get monthly email usage
    const emailsSent = ws?.plan_emails_sent_this_period || 0;

    // Use plan_limits table values if available, otherwise fallback to PLAN_CONFIG
    const limits = planLimits
      ? {
          max_campaigns: planLimits.max_campaigns === 999 ? Infinity : planLimits.max_campaigns,
          max_daily_limit: planLimits.max_daily_limit,
          monthly_email_limit: planLimits.monthly_email_limit,
        }
      : {
          max_campaigns: planConfig.maxCampaigns === null ? Infinity : planConfig.maxCampaigns,
          max_daily_limit: planKey === "starter" ? 25 : planKey === "growth" ? 75 : 200,
          monthly_email_limit: planConfig.monthlyEmailLimit === null ? Infinity : planConfig.monthlyEmailLimit,
        };

    return NextResponse.json({
      plan_tier: planKey,
      limits,
      campaign_count: campaignCount || 0,
      emails_sent_this_period: emailsSent,
      usage_percent: limits.monthly_email_limit === Infinity 
        ? 0 
        : Math.min((emailsSent / limits.monthly_email_limit) * 100, 100),
    });
  } catch (error: any) {
    console.error("Error fetching plan limits:", error);
    return NextResponse.json(
      { error: "Failed to fetch plan limits" },
      { status: 500 }
    );
  }
}














































