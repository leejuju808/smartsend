import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/inbox/owner/roi-summary
 * Generate monthly ROI summary for a roofing company
 * This is a stub implementation - can be expanded to send actual emails
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const month = searchParams.get("month"); // Format: YYYY-MM
    const workspaceId = searchParams.get("workspace_id");

    // Calculate date range for the month
    const targetMonth = month ? new Date(month + "-01") : new Date();
    const startOfMonth = new Date(targetMonth.getFullYear(), targetMonth.getMonth(), 1);
    const endOfMonth = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0, 23, 59, 59);

    // Get user's workspace
    let finalWorkspaceId = workspaceId;
    if (!finalWorkspaceId) {
      const { data: membership } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", user.id)
        .single();
      finalWorkspaceId = membership?.workspace_id;
    }

    if (!finalWorkspaceId) {
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 404 }
      );
    }

    // Get campaigns for workspace
    const { data: campaigns } = await supabase
      .from("campaigns")
      .select("id")
      .eq("workspace_id", finalWorkspaceId);

    const campaignIds = campaigns?.map((c) => c.id) || [];

    if (campaignIds.length === 0) {
      return NextResponse.json({
        month: month || targetMonth.toISOString().slice(0, 7),
        replies_received: 0,
        hot_leads: 0,
        booked_jobs: 0,
        booked_revenue: 0,
        projected_pipeline: 0,
        average_response_time: null,
        ai_accuracy_report: null,
        roi_percentage: 0,
      });
    }

    // 1. Replies Received
    const { count: repliesCount } = await supabase
      .from("inbox_messages")
      .select("*", { count: "exact", head: true })
      .in("campaign_id", campaignIds)
      .gte("received_at", startOfMonth.toISOString())
      .lte("received_at", endOfMonth.toISOString());

    // 2. Hot Leads
    const { count: hotLeadsCount } = await supabase
      .from("inbox_threads")
      .select("*", { count: "exact", head: true })
      .in("campaign_id", campaignIds)
      .eq("ai_overall_intent", "hot")
      .gte("last_message_at", startOfMonth.toISOString())
      .lte("last_message_at", endOfMonth.toISOString());

    // 3. Booked Jobs
    const { count: bookedJobsCount } = await supabase
      .from("jobs_conversions")
      .select("*", { count: "exact", head: true })
      .in("campaign_id", campaignIds)
      .eq("conversion_type", "booked_estimate")
      .gte("created_at", startOfMonth.toISOString())
      .lte("created_at", endOfMonth.toISOString());

    // 4. Booked Revenue
    const { data: bookedConversions } = await supabase
      .from("jobs_conversions")
      .select("estimated_value")
      .in("campaign_id", campaignIds)
      .or("conversion_type.eq.won_job,pipeline_stage.eq.won")
      .gte("created_at", startOfMonth.toISOString())
      .lte("created_at", endOfMonth.toISOString());

    const bookedRevenue = bookedConversions?.reduce((sum, conv) => {
      return sum + (conv.estimated_value ? Number(conv.estimated_value) : 0);
    }, 0) || 0;

    // 5. Projected Pipeline Value
    const { data: pipelineConversions } = await supabase
      .from("jobs_conversions")
      .select("estimated_value, probability")
      .in("campaign_id", campaignIds)
      .in("pipeline_stage", ["booked", "pending"])
      .gte("created_at", startOfMonth.toISOString())
      .lte("created_at", endOfMonth.toISOString());

    const projectedPipeline = pipelineConversions?.reduce((sum, conv) => {
      const value = conv.estimated_value ? Number(conv.estimated_value) : 0;
      const prob = conv.probability ? Number(conv.probability) / 100 : 0.8;
      return sum + (value * prob);
    }, 0) || 0;

    // 6. Average Response Time (placeholder - would need to track actual response times)
    const averageResponseTime = null; // TODO: Calculate from inbox_actions timestamps

    // 7. AI Accuracy Report (placeholder)
    const aiAccuracyReport = null; // TODO: Calculate AI classification accuracy

    // 8. ROI Calculation
    // Get subscription cost (placeholder - would need to fetch from billing/subscription table)
    const subscriptionCost = 199; // Default $199/month
    const roi = bookedRevenue > 0 && subscriptionCost > 0
      ? ((bookedRevenue - subscriptionCost) / subscriptionCost) * 100
      : 0;

    return NextResponse.json({
      month: month || targetMonth.toISOString().slice(0, 7),
      replies_received: repliesCount || 0,
      hot_leads: hotLeadsCount || 0,
      booked_jobs: bookedJobsCount || 0,
      booked_revenue: Math.round(bookedRevenue),
      projected_pipeline: Math.round(projectedPipeline),
      average_response_time: averageResponseTime,
      ai_accuracy_report: aiAccuracyReport,
      roi_percentage: Math.round(roi),
      subscription_cost: subscriptionCost,
    });
  } catch (error) {
    console.error("Error generating ROI summary:", error);
    return NextResponse.json(
      { error: "Failed to generate ROI summary" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/inbox/owner/roi-summary/send-email
 * Send monthly ROI summary email to roofing owner
 * This is a stub - would integrate with email sending service
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json();
    const { month, email } = body;

    // Get ROI summary
    const summaryResponse = await fetch(
      `${req.nextUrl.origin}/api/inbox/owner/roi-summary?month=${month || ""}`
    );
    const summary = await summaryResponse.json();

    // TODO: Send email via email service (SendGrid, Resend, etc.)
    // For now, just return the summary that would be emailed
    return NextResponse.json({
      success: true,
      message: "ROI summary email queued (stub implementation)",
      summary,
      email: email || user.email,
    });
  } catch (error) {
    console.error("Error sending ROI summary email:", error);
    return NextResponse.json(
      { error: "Failed to send ROI summary email" },
      { status: 500 }
    );
  }
}



















































