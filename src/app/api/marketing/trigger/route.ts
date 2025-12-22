// Block 239000 — SmartSend Roofing Marketing Hub v1
// POST /api/marketing/trigger - Trigger a campaign for a target

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
    } = body;

    // Validation
    if (!campaign_id) {
      return NextResponse.json(
        { error: "Missing required field: campaign_id" },
        { status: 400 }
      );
    }

    if (!lead_id && !homeowner_id && !job_id) {
      return NextResponse.json(
        { error: "Must provide at least one: lead_id, homeowner_id, or job_id" },
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

    // Trigger the campaign using database function
    const { data: instanceId, error: triggerError } = await supabase.rpc(
      'trigger_marketing_campaign',
      {
        p_campaign_id: campaign_id,
        p_lead_id: lead_id || null,
        p_homeowner_id: homeowner_id || null,
        p_job_id: job_id || null,
      }
    );

    if (triggerError) {
      console.error("[Marketing Hub] Trigger error:", triggerError);
      return NextResponse.json(
        { error: "Failed to trigger campaign" },
        { status: 500 }
      );
    }

    // Get the created instance
    const { data: instance, error: instanceError } = await supabase
      .from("marketing_campaign_instances")
      .select("*")
      .eq("id", instanceId)
      .single();

    if (instanceError) {
      console.error("[Marketing Hub] Fetch instance error:", instanceError);
    }

    return NextResponse.json(
      { 
        instance_id: instanceId,
        instance: instance || null,
        message: "Campaign triggered successfully"
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("[Marketing Hub] Unexpected error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























