/**
 * Block 25420 — SmartSend Roofing Marketing Engine v1
 * Marketing Campaigns API
 * 
 * GET /api/marketing/campaigns - List all marketing campaigns
 * POST /api/marketing/campaigns - Create a new marketing campaign
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get workspace_id from query params or user's active workspace
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("workspace_id");

    if (!workspaceId) {
      return NextResponse.json({ error: "workspace_id required" }, { status: 400 });
    }

    // Verify workspace access
    const { data: workspaceMember } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .single();

    if (!workspaceMember) {
      return NextResponse.json({ error: "Workspace access denied" }, { status: 403 });
    }

    // Get campaigns
    const { data: campaigns, error } = await supabase
      .from("marketing_campaigns")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching campaigns:", error);
      return NextResponse.json({ error: "Failed to fetch campaigns" }, { status: 500 });
    }

    return NextResponse.json({ campaigns });
  } catch (error: any) {
    console.error("Error in GET /api/marketing/campaigns:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      workspace_id,
      name,
      campaign_type,
      targeting_type,
      targeting_config,
      audience_filters,
      subject_template,
      body_template,
      from_email_account_id,
      sending_identity_id,
      start_date,
      end_date,
      timezone,
      sending_window_start,
      sending_window_end,
      daily_send_cap,
      sequence_steps,
      storm_event_id,
      storm_zip,
      storm_severity,
      season,
      referral_incentive_type,
      referral_incentive_value,
    } = body;

    // Validation
    if (!workspace_id || !name || !campaign_type || !subject_template || !body_template) {
      return NextResponse.json(
        { error: "Missing required fields: workspace_id, name, campaign_type, subject_template, body_template" },
        { status: 400 }
      );
    }

    // Verify workspace access
    const { data: workspaceMember } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!workspaceMember) {
      return NextResponse.json({ error: "Workspace access denied" }, { status: 403 });
    }

    // Create campaign
    const { data: campaign, error } = await supabase
      .from("marketing_campaigns")
      .insert({
        workspace_id,
        name,
        campaign_type,
        targeting_type: targeting_type || "all",
        targeting_config: targeting_config || {},
        audience_filters: audience_filters || {},
        subject_template,
        body_template,
        from_email_account_id: from_email_account_id || null,
        sending_identity_id: sending_identity_id || null,
        start_date: start_date || null,
        end_date: end_date || null,
        timezone: timezone || "America/Los_Angeles",
        sending_window_start: sending_window_start || null,
        sending_window_end: sending_window_end || null,
        daily_send_cap: daily_send_cap || null,
        sequence_steps: sequence_steps || [],
        storm_event_id: storm_event_id || null,
        storm_zip: storm_zip || null,
        storm_severity: storm_severity || null,
        season: season || null,
        referral_incentive_type: referral_incentive_type || null,
        referral_incentive_value: referral_incentive_value || null,
        created_by: user.id,
        status: "draft",
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating campaign:", error);
      return NextResponse.json({ error: "Failed to create campaign" }, { status: 500 });
    }

    return NextResponse.json({ campaign }, { status: 201 });
  } catch (error: any) {
    console.error("Error in POST /api/marketing/campaigns:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}




































