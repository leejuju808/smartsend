// app/api/campaigns/[id]/activity/route.ts
// Block 15700 — Log campaign activity events

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();

  // Verify authentication
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const campaignId = params.id;
  const body = await req.json();
  const { activity_type } = body;

  // Validate activity_type
  const validTypes = ['created', 'edited', 'reviewed', 'scheduled', 'sent', 'paused', 'completed'];
  if (!activity_type || !validTypes.includes(activity_type)) {
    return NextResponse.json(
      { error: "Invalid activity_type" },
      { status: 400 }
    );
  }

  // Get campaign workspace_id
  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .select("workspace_id")
    .eq("id", campaignId)
    .single();

  if (campaignError || !campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  // Log activity using the log_activity function if it exists
  const { error: logError } = await supabase.rpc("log_activity", {
    p_campaign: campaignId,
    p_actor: user.id,
    p_event: activity_type,
    p_meta: {},
  });

  // If RPC doesn't exist, insert directly
  if (logError) {
    const { error: insertError } = await supabase
      .from("campaign_activity")
      .insert({
        campaign_id: campaignId,
        actor_id: user.id,
        event: activity_type,
        activity_type: activity_type,
        meta: {},
      });

    if (insertError) {
      console.error("Failed to log activity:", insertError);
      return NextResponse.json(
        { error: "Failed to log activity" },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ success: true });
}



























































