/**
 * Block 25420 — SmartSend Roofing Marketing Engine v1
 * Storm Campaign Triggers API
 * 
 * GET /api/marketing/storm-triggers - List storm campaign triggers
 * POST /api/marketing/storm-triggers - Create storm campaign trigger
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

    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("workspace_id");
    const approvalStatus = searchParams.get("approval_status");

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

    // Build query
    let query = supabase
      .from("storm_campaign_triggers")
      .select(`
        *,
        storm_event:storm_events(*),
        campaign:marketing_campaigns(*)
      `)
      .eq("workspace_id", workspaceId)
      .order("detected_at", { ascending: false });

    if (approvalStatus) {
      query = query.eq("approval_status", approvalStatus);
    }

    const { data: triggers, error } = await query;

    if (error) {
      console.error("Error fetching storm triggers:", error);
      return NextResponse.json({ error: "Failed to fetch triggers" }, { status: 500 });
    }

    return NextResponse.json({ triggers });
  } catch (error: any) {
    console.error("Error in GET /api/marketing/storm-triggers:", error);
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
      storm_event_id,
      campaign_template_id,
      auto_create,
      requires_approval,
      affected_zips,
      affected_neighborhoods,
      radius_miles,
    } = body;

    // Validation
    if (!workspace_id || !storm_event_id) {
      return NextResponse.json(
        { error: "Missing required fields: workspace_id, storm_event_id" },
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

    // Create trigger
    const { data: trigger, error } = await supabase
      .from("storm_campaign_triggers")
      .insert({
        workspace_id,
        storm_event_id,
        campaign_template_id: campaign_template_id || null,
        auto_create: auto_create || false,
        requires_approval: requires_approval !== undefined ? requires_approval : true,
        affected_zips: affected_zips || [],
        affected_neighborhoods: affected_neighborhoods || [],
        radius_miles: radius_miles || 5,
        approval_status: requires_approval !== false ? "pending" : "approved",
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating storm trigger:", error);
      return NextResponse.json({ error: "Failed to create trigger" }, { status: 500 });
    }

    // If auto_create is true, create the campaign
    if (auto_create && campaign_template_id) {
      // This would create a campaign from the template
      // Implementation depends on your template system
    }

    return NextResponse.json({ trigger }, { status: 201 });
  } catch (error: any) {
    console.error("Error in POST /api/marketing/storm-triggers:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}




































