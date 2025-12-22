import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
      .select("workspace_id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!membership) {
      return NextResponse.json({ hasFailures: false });
    }

    const workspaceId = membership.workspace_id;

    // Check for recent plan limit failures in send_queue
    // Look for items with status='failed' and last_error='plan_limit_reached'
    // within the last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Get campaigns for this workspace
    const { data: campaigns } = await supabase
      .from("campaigns")
      .select("id")
      .eq("workspace_id", workspaceId);

    if (!campaigns || campaigns.length === 0) {
      return NextResponse.json({ hasFailures: false });
    }

    const campaignIds = campaigns.map((c) => c.id);

    // Check send_queue for plan limit failures
    const { count } = await supabase
      .from("send_queue")
      .select("id", { count: "exact", head: true })
      .in("campaign_id", campaignIds)
      .eq("status", "failed")
      .eq("last_error", "plan_limit_reached")
      .gte("updated_at", sevenDaysAgo.toISOString());

    return NextResponse.json({
      hasFailures: (count || 0) > 0,
    });
  } catch (error: any) {
    console.error("Error checking plan failures:", error);
    return NextResponse.json({ hasFailures: false });
  }
}














































