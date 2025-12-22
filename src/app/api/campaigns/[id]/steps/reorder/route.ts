import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const sb = createRouteHandlerClient({ cookies });
  const campaignId = params.id;

  const body = await req.json();
  const { ordered_step_ids } = body as {
    ordered_step_ids: string[];
  };

  if (!Array.isArray(ordered_step_ids)) {
    return NextResponse.json(
      { error: "Invalid payload" },
      { status: 400 }
    );
  }

  const { data: { user }, error: authErr } = await sb.auth.getUser();
  if (authErr || !user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Validate campaign exists
  const { data: campaign, error: campErr } = await sb
    .from("campaigns")
    .select("id, workspace_id, user_id")
    .eq("id", campaignId)
    .single();
  
  if (campErr || !campaign)
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  // Check workspace membership if workspace_id exists
  if (campaign.workspace_id) {
    const { data: member } = await sb
      .from("workspace_members")
      .select("user_id")
      .eq("workspace_id", campaign.workspace_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!member)
      return NextResponse.json(
        { error: "Not allowed" },
        { status: 403 }
      );
  } else if (campaign.user_id !== user.id) {
    // Fallback: check if user owns the campaign directly
    return NextResponse.json(
      { error: "Not allowed" },
      { status: 403 }
    );
  }

  // Verify all step IDs belong to this campaign
  const { data: existingSteps, error: stepsErr } = await sb
    .from("campaign_steps")
    .select("id")
    .eq("campaign_id", campaignId)
    .in("id", ordered_step_ids);

  if (stepsErr)
    return NextResponse.json({ error: stepsErr.message }, { status: 400 });

  if (!existingSteps || existingSteps.length !== ordered_step_ids.length) {
    return NextResponse.json(
      { error: "Some steps do not belong to this campaign" },
      { status: 400 }
    );
  }

  // Update all step orders
  // step_no is 1-indexed in the database
  const updates = ordered_step_ids.map((id, index) => ({
    id,
    step_no: index + 1,
  }));

  // Update each step individually to avoid conflicts
  for (const update of updates) {
    const { error } = await sb
      .from("campaign_steps")
      .update({ step_no: update.step_no })
      .eq("id", update.id)
      .eq("campaign_id", campaignId);

    if (error) {
      console.error("Error updating step order:", error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
  }

  return NextResponse.json({ ok: true });
}

