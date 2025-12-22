/**
 * Block 25420 — SmartSend Roofing Marketing Engine v1
 * Individual Marketing Campaign API
 * 
 * GET /api/marketing/campaigns/[id] - Get campaign details
 * PATCH /api/marketing/campaigns/[id] - Update campaign
 * DELETE /api/marketing/campaigns/[id] - Delete campaign
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Get campaign with recipients count
    const { data: campaign, error } = await supabase
      .from("marketing_campaigns")
      .select(`
        *,
        recipients:marketing_campaign_recipients(count)
      `)
      .eq("id", id)
      .single();

    if (error || !campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
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

    return NextResponse.json({ campaign });
  } catch (error: any) {
    console.error("Error in GET /api/marketing/campaigns/[id]:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();

    // Get campaign to verify access
    const { data: campaign } = await supabase
      .from("marketing_campaigns")
      .select("workspace_id")
      .eq("id", id)
      .single();

    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
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

    // Update campaign
    const { data: updatedCampaign, error } = await supabase
      .from("marketing_campaigns")
      .update(body)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Error updating campaign:", error);
      return NextResponse.json({ error: "Failed to update campaign" }, { status: 500 });
    }

    return NextResponse.json({ campaign: updatedCampaign });
  } catch (error: any) {
    console.error("Error in PATCH /api/marketing/campaigns/[id]:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Get campaign to verify access
    const { data: campaign } = await supabase
      .from("marketing_campaigns")
      .select("workspace_id, status")
      .eq("id", id)
      .single();

    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
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

    // Prevent deletion of active campaigns
    if (campaign.status === "active") {
      return NextResponse.json(
        { error: "Cannot delete active campaign. Pause it first." },
        { status: 400 }
      );
    }

    // Delete campaign (cascade will handle recipients)
    const { error } = await supabase
      .from("marketing_campaigns")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Error deleting campaign:", error);
      return NextResponse.json({ error: "Failed to delete campaign" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error in DELETE /api/marketing/campaigns/[id]:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}




































