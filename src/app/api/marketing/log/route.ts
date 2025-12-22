// Block 239000 — SmartSend Roofing Marketing Hub v1
// POST /api/marketing/log - Log a campaign event

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      campaign_id,
      lead_id,
      homeowner_id,
      job_id,
      step_id,
      step_number,
      status,
      channel,
      message_id,
      error_message,
      metadata = {},
    } = body;

    // Validation
    if (!campaign_id || !status || !channel) {
      return NextResponse.json(
        { error: "Missing required fields: campaign_id, status, channel" },
        { status: 400 }
      );
    }

    // Validate status
    const validStatuses = ['sent', 'failed', 'skipped', 'paused', 'bounced', 'unsubscribed'];
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` },
        { status: 400 }
      );
    }

    // Validate channel
    const validChannels = ['email', 'sms'];
    if (!validChannels.includes(channel)) {
      return NextResponse.json(
        { error: `Invalid channel. Must be one of: ${validChannels.join(", ")}` },
        { status: 400 }
      );
    }

    // Verify campaign exists and user has access
    const { data: campaign, error: campaignError } = await supabase
      .from("marketing_campaigns")
      .select(`
        *,
        workspaces!inner(id)
      `)
      .eq("id", campaign_id)
      .single();

    if (campaignError || !campaign) {
      return NextResponse.json(
        { error: "Campaign not found" },
        { status: 404 }
      );
    }

    // Verify workspace access
    const { data: workspaceMember } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", campaign.workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!workspaceMember) {
      return NextResponse.json({ error: "Workspace access denied" }, { status: 403 });
    }

    // Create log entry
    const { data: log, error: logError } = await supabase
      .from("marketing_logs")
      .insert({
        campaign_id,
        lead_id: lead_id || null,
        homeowner_id: homeowner_id || null,
        job_id: job_id || null,
        step_id: step_id || null,
        step_number: step_number || null,
        status,
        channel,
        message_id: message_id || null,
        error_message: error_message || null,
        metadata,
        sent_at: status === 'sent' ? new Date().toISOString() : null,
      })
      .select()
      .single();

    if (logError) {
      console.error("[Marketing Hub] Log error:", logError);
      return NextResponse.json(
        { error: "Failed to create log entry" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { log },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("[Marketing Hub] Unexpected error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























