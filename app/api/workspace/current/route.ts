import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get user's workspace membership (get first workspace they belong to)
  const { data: membership, error: memberError } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (memberError || !membership) {
    return NextResponse.json({ error: "No workspace found" }, { status: 404 });
  }

  // Get workspace details
  const { data: workspace, error: workspaceError } = await supabase
    .from("workspaces")
    .select("id, name, plan_key, email_limit_monthly, email_used_this_period, billing_period_ends_at, plan_emails_sent_this_period, plan_period_start, plan_period_end, stripe_subscription_id, billing_status")
    .eq("id", membership.workspace_id)
    .single();

  if (workspaceError || !workspace) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  return NextResponse.json({
    workspace: {
      id: workspace.id,
      name: workspace.name,
      plan_key: workspace.plan_key || "starter",
      email_limit_monthly: workspace.email_limit_monthly ?? 0,
      email_used_this_period: workspace.email_used_this_period ?? 0,
      billing_period_ends_at: workspace.billing_period_ends_at,
      plan_emails_sent_this_period: workspace.plan_emails_sent_this_period ?? 0,
      plan_period_start: workspace.plan_period_start,
      plan_period_end: workspace.plan_period_end,
      stripe_subscription_id: workspace.stripe_subscription_id,
      billing_status: workspace.billing_status,
    },
    role: membership.role,
  });
}

