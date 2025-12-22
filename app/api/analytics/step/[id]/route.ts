import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const stepId = params.id;

    // Verify user has access to this step's campaign
    const { data: step } = await supabase
      .from("campaign_steps")
      .select("id, campaign_id, campaigns!inner(workspace_id)")
      .eq("id", stepId)
      .single();

    if (!step) {
      return NextResponse.json({ error: "Step not found" }, { status: 404 });
    }

    const campaign = step.campaigns as any;
    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    // Check workspace membership
    const { data: workspaceMember } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", campaign.workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!workspaceMember) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Get step analytics (all variants)
    const { data, error } = await supabase
      .from("analytics_step_variant")
      .select("*")
      .eq("step_id", stepId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Aggregate all variants for step totals
    const totals = (data || []).reduce(
      (acc, row) => ({
        sent: acc.sent + (row.sent || 0),
        delivered: acc.delivered + (row.delivered || 0),
        opens: acc.opens + (row.opens || 0),
        unique_opens: acc.unique_opens + (row.unique_opens || 0),
        clicks: acc.clicks + (row.clicks || 0),
        replies: acc.replies + (row.replies || 0),
        bounces: acc.bounces + (row.bounces || 0),
      }),
      {
        sent: 0,
        delivered: 0,
        opens: 0,
        unique_opens: 0,
        clicks: 0,
        replies: 0,
        bounces: 0,
      }
    );

    // Calculate rates for each variant
    const variants = (data || []).map((row) => {
      const sent = row.sent || 0;
      return {
        ...row,
        open_rate: sent > 0 ? ((row.opens || 0) / sent) * 100 : 0,
        unique_open_rate: sent > 0 ? ((row.unique_opens || 0) / sent) * 100 : 0,
        click_rate: sent > 0 ? ((row.clicks || 0) / sent) * 100 : 0,
        reply_rate: sent > 0 ? ((row.replies || 0) / sent) * 100 : 0,
        bounce_rate: sent > 0 ? ((row.bounces || 0) / sent) * 100 : 0,
      };
    });

    const result = {
      step_id: stepId,
      totals: {
        ...totals,
        open_rate: totals.sent > 0 ? (totals.opens / totals.sent) * 100 : 0,
        unique_open_rate: totals.sent > 0 ? (totals.unique_opens / totals.sent) * 100 : 0,
        click_rate: totals.sent > 0 ? (totals.clicks / totals.sent) * 100 : 0,
        reply_rate: totals.sent > 0 ? (totals.replies / totals.sent) * 100 : 0,
        bounce_rate: totals.sent > 0 ? (totals.bounces / totals.sent) * 100 : 0,
      },
      variants,
    };

    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=600",
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}



