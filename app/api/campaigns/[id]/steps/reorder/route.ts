import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// POST /api/campaigns/[id]/steps/reorder - Reorder steps
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
  const { step_ids } = body; // Array of step IDs in new order

  if (!Array.isArray(step_ids) || step_ids.length === 0) {
    return NextResponse.json(
      { error: "step_ids must be a non-empty array" },
      { status: 400 }
    );
  }

  // Update step_order for each step
  const updates = step_ids.map((stepId: string, index: number) =>
    supabase
      .from("campaign_steps")
      .update({ step_order: index })
      .eq("id", stepId)
      .eq("campaign_id", campaignId)
  );

  const results = await Promise.all(updates);
  const errors = results.filter((r) => r.error);

  if (errors.length > 0) {
    return NextResponse.json(
      {
        error: "Failed to reorder steps",
        details: errors.map((e) => e.error?.message).join(", "),
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
















































