/**
 * Block 10700 — SmartSend Scheduler & Send Queue v1
 * Campaign Schedule API: Schedules all campaign messages into the queue
 * 
 * When a campaign is created, this endpoint schedules:
 * - Message 1: Send immediately
 * - Message 2: Send after 2 days (if no reply)
 * - Message 3: Send after 4 days (if no reply)
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { scheduleCampaign, logEvent } from "@/lib/queue/scheduler";
import type { CampaignSequence } from "@/lib/queue/scheduler";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      campaignId,
      contactIds,
      sequence,
      startTime,
    }: {
      campaignId: string;
      contactIds: string[];
      sequence: CampaignSequence;
      startTime?: string;
    } = body;

    // Validate input
    if (!campaignId || !contactIds || !sequence) {
      return NextResponse.json(
        { error: "Missing required fields: campaignId, contactIds, sequence" },
        { status: 400 }
      );
    }

    if (!Array.isArray(contactIds) || contactIds.length === 0) {
      return NextResponse.json(
        { error: "contactIds must be a non-empty array" },
        { status: 400 }
      );
    }

    // Validate sequence structure
    if (!sequence.step1 || !sequence.step2 || !sequence.step3) {
      return NextResponse.json(
        { error: "Sequence must have step1, step2, and step3 with subject and body" },
        { status: 400 }
      );
    }

    // Verify campaign exists and user has access
    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .select("id, user_id, workspace_id")
      .eq("id", campaignId)
      .single();

    if (campaignError || !campaign) {
      return NextResponse.json(
        { error: "Campaign not found" },
        { status: 404 }
      );
    }

    // Check if user has access to this campaign
    // (Assuming campaigns have user_id or workspace_id)
    if (campaign.user_id !== user.id) {
      // Check workspace membership if using workspace_id
      if (campaign.workspace_id) {
        const { data: member } = await supabase
          .from("workspace_members")
          .select("id")
          .eq("workspace_id", campaign.workspace_id)
          .eq("user_id", user.id)
          .maybeSingle();

        if (!member) {
          return NextResponse.json(
            { error: "Access denied" },
            { status: 403 }
          );
        }
      } else {
        return NextResponse.json(
          { error: "Access denied" },
          { status: 403 }
        );
      }
    }

    // Parse start time or use now
    const startDate = startTime ? new Date(startTime) : new Date();

    // Use service client for queue operations (bypasses RLS)
    const serviceSupabase = await import("@/lib/supabase/server").then(
      (m) => m.createServiceClient()
    );

    // Schedule all messages
    const result = await scheduleCampaign(serviceSupabase, {
      userId: user.id,
      campaignId,
      contactIds,
      sequence,
      startTime: startDate,
    });

    // Log campaign scheduled event
    await logEvent(serviceSupabase, {
      userId: user.id,
      campaignId,
      eventType: "campaign_scheduled",
      message: `Scheduled ${result.scheduled} messages for ${contactIds.length} contacts`,
      meta: {
        contact_count: contactIds.length,
        scheduled_count: result.scheduled,
        errors: result.errors,
      },
    });

    return NextResponse.json({
      ok: true,
      scheduled: result.scheduled,
      contacts: contactIds.length,
      errors: result.errors,
      message: `Successfully scheduled ${result.scheduled} messages`,
    });
  } catch (error: any) {
    console.error("[Campaign Schedule] Error:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error.message || "Internal server error",
      },
      { status: 500 }
    );
  }
}

// GET endpoint to check schedule status
export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const campaignId = url.searchParams.get("campaignId");

    if (!campaignId) {
      return NextResponse.json(
        { error: "campaignId query parameter required" },
        { status: 400 }
      );
    }

    // Get queue stats for this campaign
    const { data: queueStats, error: statsError } = await supabase
      .from("send_queue")
      .select("id, status, sent, send_at")
      .eq("campaign_id", campaignId)
      .eq("user_id", user.id);

    if (statsError) {
      return NextResponse.json(
        { error: "Failed to fetch stats" },
        { status: 500 }
      );
    }

    const stats = {
      total: queueStats?.length || 0,
      queued: queueStats?.filter((q) => q.status === "queued" && !q.sent).length || 0,
      sent: queueStats?.filter((q) => q.sent).length || 0,
      failed: queueStats?.filter((q) => q.status === "failed").length || 0,
      sending: queueStats?.filter((q) => q.status === "sending").length || 0,
    };

    return NextResponse.json({
      ok: true,
      campaignId,
      stats,
    });
  } catch (error: any) {
    console.error("[Campaign Schedule GET] Error:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error.message || "Internal server error",
      },
      { status: 500 }
    );
  }
}























































