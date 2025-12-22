import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// PUT /api/campaigns/[id]/steps/[stepId] - Update a step
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; stepId: string }> }
) {
  const supabase = createClient();
  const { id: campaignId, stepId } = await params;

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify campaign exists and user has access
  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .select("id, workspace_id, status")
    .eq("id", campaignId)
    .single();

  if (campaignError || !campaign) {
    return NextResponse.json(
      { error: "Campaign not found" },
      { status: 404 }
    );
  }

  // Check workspace membership
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("workspace_id", campaign.workspace_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Can't edit published campaigns
  if (campaign.status === "published") {
    return NextResponse.json(
      { error: "Cannot modify published campaign. Pause it first." },
      { status: 400 }
    );
  }

  // Verify step exists and belongs to campaign
  const { data: step, error: stepError } = await supabase
    .from("campaign_steps")
    .select("id")
    .eq("id", stepId)
    .eq("campaign_id", campaignId)
    .single();

  if (stepError || !step) {
    return NextResponse.json(
      { error: "Step not found" },
      { status: 404 }
    );
  }

  const body = await req.json();
  const { step_type, config, step_order } = body;

  const updateData: any = {};
  if (step_type !== undefined) {
    if (!["email", "delay", "condition", "tag"].includes(step_type)) {
      return NextResponse.json(
        { error: "Invalid step_type" },
        { status: 400 }
      );
    }
    updateData.step_type = step_type;
  }
  if (config !== undefined) {
    updateData.config = config;
  }
  if (step_order !== undefined) {
    updateData.step_order = step_order;
  }

  // Update step
  const { data: updatedStep, error: updateError } = await supabase
    .from("campaign_steps")
    .update(updateData)
    .eq("id", stepId)
    .eq("campaign_id", campaignId)
    .select()
    .single();

  if (updateError) {
    return NextResponse.json(
      { error: "Failed to update step", details: updateError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ step: updatedStep });
}

// DELETE /api/campaigns/[id]/steps/[stepId] - Delete a step
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; stepId: string }> }
) {
  const supabase = createClient();
  const { id: campaignId, stepId } = await params;

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify campaign exists and user has access
  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .select("id, workspace_id, status")
    .eq("id", campaignId)
    .single();

  if (campaignError || !campaign) {
    return NextResponse.json(
      { error: "Campaign not found" },
      { status: 404 }
    );
  }

  // Check workspace membership
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("workspace_id", campaign.workspace_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Can't edit published campaigns
  if (campaign.status === "published") {
    return NextResponse.json(
      { error: "Cannot modify published campaign. Pause it first." },
      { status: 400 }
    );
  }

  // Verify step exists and belongs to campaign
  const { data: step, error: stepError } = await supabase
    .from("campaign_steps")
    .select("id, step_order")
    .eq("id", stepId)
    .eq("campaign_id", campaignId)
    .single();

  if (stepError || !step) {
    return NextResponse.json(
      { error: "Step not found" },
      { status: 404 }
    );
  }

  // Delete step
  const { error: deleteError } = await supabase
    .from("campaign_steps")
    .delete()
    .eq("id", stepId)
    .eq("campaign_id", campaignId);

  if (deleteError) {
    return NextResponse.json(
      { error: "Failed to delete step", details: deleteError.message },
      { status: 500 }
    );
  }

  // Reorder remaining steps
  const { error: reorderError } = await supabase.rpc("reorder_campaign_steps", {
    p_campaign_id: campaignId,
  });

  if (reorderError) {
    // Log but don't fail - steps are deleted, just ordering might be off
    console.error("Failed to reorder steps after deletion:", reorderError);
  }

  return NextResponse.json({ success: true });
}






