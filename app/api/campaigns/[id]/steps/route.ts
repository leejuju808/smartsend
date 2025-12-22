import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /api/campaigns/[id]/steps - Get all steps for a campaign
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = createClient();
  const { id: campaignId } = await params;

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
    .select("id, workspace_id")
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

  // Get steps ordered by step_order
  const { data: steps, error: stepsError } = await supabase
    .from("campaign_steps")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("step_order", { ascending: true });

  if (stepsError) {
    return NextResponse.json(
      { error: "Failed to fetch steps", details: stepsError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ steps: steps || [] });
}

// POST /api/campaigns/[id]/steps - Create a new step
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = createClient();
  const { id: campaignId } = await params;

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

  const body = await req.json();
  const { step_type, config, step_order } = body;

  if (!step_type || !["email", "delay", "condition", "tag"].includes(step_type)) {
    return NextResponse.json(
      { error: "Invalid step_type. Must be: email, delay, condition, or tag" },
      { status: 400 }
    );
  }

  // Get next step order if not provided
  let order = step_order;
  if (order === undefined || order === null) {
    const { data: maxStep } = await supabase
      .from("campaign_steps")
      .select("step_order")
      .eq("campaign_id", campaignId)
      .order("step_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    order = maxStep ? maxStep.step_order + 1 : 0;
  }

  // Insert step
  const { data: step, error: insertError } = await supabase
    .from("campaign_steps")
    .insert({
      campaign_id: campaignId,
      step_type,
      step_order: order,
      config: config || {},
    })
    .select()
    .single();

  if (insertError) {
    return NextResponse.json(
      { error: "Failed to create step", details: insertError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ step }, { status: 201 });
}
















































