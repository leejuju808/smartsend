/**
 * Block 25420 — SmartSend Roofing Marketing Engine v1
 * Newsletter Builder API
 * 
 * GET /api/marketing/newsletters - List newsletters
 * POST /api/marketing/newsletters - Create newsletter campaign
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

    // Get newsletter campaigns (campaign_type = 'newsletter')
    const { data: newsletters, error } = await supabase
      .from("marketing_campaigns")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("campaign_type", "newsletter")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching newsletters:", error);
      return NextResponse.json({ error: "Failed to fetch newsletters" }, { status: 500 });
    }

    return NextResponse.json({ newsletters });
  } catch (error: any) {
    console.error("Error in GET /api/marketing/newsletters:", error);
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
      subject_template,
      body_template,
      from_email_account_id,
      sending_identity_id,
      start_date,
      timezone,
      targeting_type,
      targeting_config,
    } = body;

    // Validation
    if (!workspace_id || !name || !subject_template || !body_template) {
      return NextResponse.json(
        { error: "Missing required fields: workspace_id, name, subject_template, body_template" },
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

    // Create newsletter campaign
    const { data: newsletter, error } = await supabase
      .from("marketing_campaigns")
      .insert({
        workspace_id,
        name,
        campaign_type: "newsletter",
        targeting_type: targeting_type || "all",
        targeting_config: targeting_config || {},
        subject_template,
        body_template,
        from_email_account_id: from_email_account_id || null,
        sending_identity_id: sending_identity_id || null,
        start_date: start_date || null,
        timezone: timezone || "America/Los_Angeles",
        created_by: user.id,
        status: "draft",
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating newsletter:", error);
      return NextResponse.json({ error: "Failed to create newsletter" }, { status: 500 });
    }

    return NextResponse.json({ newsletter }, { status: 201 });
  } catch (error: any) {
    console.error("Error in POST /api/marketing/newsletters:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}




































