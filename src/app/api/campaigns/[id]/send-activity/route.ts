// src/app/api/campaigns/[id]/send-activity/route.ts
// Block 15500 — Campaign Debug View v2 (Send Activity Tab)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
});

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const campaignId = params.id;

    // Get campaign info
    const { data: campaign, error: campaignError } = await supabaseAdmin
      .from("campaigns")
      .select("id, workspace_id, name")
      .eq("id", campaignId)
      .maybeSingle();

    if (campaignError || !campaign) {
      return NextResponse.json(
        { error: "Campaign not found" },
        { status: 404 }
      );
    }

    const workspaceId = campaign.workspace_id;

    // Get queue statistics
    const { data: queueStats } = await supabaseAdmin
      .from("campaign_send_queue")
      .select("status, priority, step_number, scheduled_at, sent_at, retry_count, suppressed")
      .eq("campaign_id", campaignId);

    // Calculate statistics
    const stats = {
      queued: queueStats?.filter((q: any) => 
        ["pending", "queued", "scheduled", "throttled"].includes(q.status)
      ).length || 0,
      ,
      sent: queueStats?.filter((q: any) => q.status === "sent").length || 0,
      failed: queueStats?.filter((q: any) => q.status === "failed").length || 0,
      retrying: queueStats?.filter((q: any) => q.status === "retry").length || 0,
      skipped: queueStats?.filter((q: any) => 
        q.status === "skipped_suppressed" || q.suppressed
      ).length || 0,
      suppressed: queueStats?.filter((q: any) => q.suppressed).length || 0,
    };

    // Get priority breakdown
    const priorityBreakdown = {
      priority_1: queueStats?.filter((q: any) => q.priority === 1).length || 0,
      priority_2: queueStats?.filter((q: any) => q.priority === 2).length || 0,
      priority_3: queueStats?.filter((q: any) => q.priority === 3).length || 0,
      priority_4: queueStats?.filter((q: any) => q.priority === 4).length || 0,
      priority_5: queueStats?.filter((q: any) => q.priority === 5).length || 0,
    };

    // Calculate average send pace (emails per hour)
    const sentJobs = queueStats?.filter((q: any) => q.status === "sent" && q.sent_at) || [];
    let avgPace = 0;
    if (sentJobs.length > 1) {
      const times = sentJobs
        .map((q: any) => new Date(q.sent_at).getTime())
        .sort((a: number, b: number) => a - b);
      const totalTime = (times[times.length - 1] - times[0]) / (1000 * 60 * 60); // hours
      avgPace = totalTime > 0 ? sentJobs.length / totalTime : 0;
    }

    // Get warmup status
    const { data: settings } = await supabaseAdmin
      .from("company_settings")
      .select("warmup_active, warmup_stage, warmup_started_at, domain_health_score, max_send_rate")
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    const warmupStatus = {
      active: settings?.warmup_active || false,
      stage: settings?.warmup_stage || 0,
      started_at: settings?.warmup_started_at || null,
      limit: settings?.warmup_active && settings?.warmup_stage > 0 && settings?.warmup_stage <= 8
        ? [20, 30, 40, 50, 75, 100, 150, null][settings.warmup_stage - 1] || null
        : null,
    };

    // Get safety events (last 24 hours)
    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

    const { data: safetyEvents } = await supabaseAdmin
      .from("deliverability_events")
      .select("*")
      .eq("workspace_id", workspaceId)
      .or(`campaign_id.eq.${campaignId},campaign_id.is.null`)
      .gte("created_at", twentyFourHoursAgo.toISOString())
      .order("created_at", { ascending: false })
      .limit(50);

    // Get recent retry jobs
    const { data: retryJobs } = await supabaseAdmin
      .from("campaign_send_queue")
      .select("id, to_email, retry_count, next_retry_at, last_error, step_number")
      .eq("campaign_id", campaignId)
      .eq("status", "retry")
      .order("next_retry_at", { ascending: true })
      .limit(20);

    // Get suppressed contacts
    const { data: suppressedContacts } = await supabaseAdmin
      .from("campaign_send_queue")
      .select("contact_id, to_email, suppression_reason, scheduled_at")
      .eq("campaign_id", campaignId)
      .eq("suppressed", true)
      .limit(20);

    return NextResponse.json({
      campaign_id: campaignId,
      campaign_name: campaign.name,
      stats,
      priority_breakdown: priorityBreakdown,
      average_send_pace: Math.round(avgPace * 10) / 10, // Round to 1 decimal
      warmup_status: warmupStatus,
      domain_health: settings?.domain_health_score || null,
      max_send_rate: settings?.max_send_rate || null,
      safety_events: safetyEvents || [],
      retry_jobs: retryJobs || [],
      suppressed_contacts: suppressedContacts || [],
      last_updated: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error fetching send activity:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}





















































