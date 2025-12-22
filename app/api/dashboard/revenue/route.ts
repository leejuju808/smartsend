import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get user's workspace_id
  const { data: workspaceMember } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!workspaceMember?.workspace_id) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  const workspaceId = workspaceMember.workspace_id;

  // Calculate revenue stats for this workspace
  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - 30);

  // Won contacts (last 30 days)
  const { data: wonContacts } = await supabase
    .from("contacts")
    .select("actual_job_value")
    .eq("workspace_id", workspaceId)
    .eq("lead_status", "won")
    .not("won_at", "is", null)
    .gte("won_at", windowStart.toISOString());

  const wonCount = wonContacts?.length || 0;
  const wonRevenue = wonContacts?.reduce((sum, c) => sum + (Number(c.actual_job_value) || 0), 0) || 0;

  // Pipeline values (all time)
  const { data: pipelineContacts } = await supabase
    .from("contacts")
    .select("lead_status, est_job_value")
    .eq("workspace_id", workspaceId)
    .in("lead_status", ["hot", "warm"]);

  const hotPipeline = pipelineContacts?.filter(c => c.lead_status === "hot").reduce((sum, c) => sum + (Number(c.est_job_value) || 0), 0) || 0;
  const warmPipeline = pipelineContacts?.filter(c => c.lead_status === "warm").reduce((sum, c) => sum + (Number(c.est_job_value) || 0), 0) || 0;

  // Lifetime revenue
  const { data: lifetimeContacts } = await supabase
    .from("contacts")
    .select("actual_job_value")
    .eq("workspace_id", workspaceId)
    .eq("lead_status", "won")
    .not("actual_job_value", "is", null);

  const lifetimeRevenue = lifetimeContacts?.reduce((sum, c) => sum + (Number(c.actual_job_value) || 0), 0) || 0;

  return NextResponse.json({
    won_count: wonCount,
    won_revenue: wonRevenue,
    hot_pipeline: hotPipeline,
    warm_pipeline: warmPipeline,
    lifetime_revenue: lifetimeRevenue,
  });
}

