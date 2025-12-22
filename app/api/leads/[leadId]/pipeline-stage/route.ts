import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function POST(
  req: NextRequest,
  { params }: { params: { leadId: string } }
) {
  const supabase = createRouteHandlerClient({ cookies });

  // Get current user for account_id
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { pipeline_stage, campaign_id } = body;

  if (!pipeline_stage) {
    return NextResponse.json(
      { error: "pipeline_stage is required" },
      { status: 400 }
    );
  }

  if (!campaign_id) {
    return NextResponse.json(
      { error: "campaign_id is required" },
      { status: 400 }
    );
  }

  // Validate pipeline_stage enum value
  const validStages = [
    "new",
    "contacted",
    "estimate_scheduled",
    "estimate_sent",
    "follow_up",
    "won",
    "lost",
  ];

  if (!validStages.includes(pipeline_stage)) {
    return NextResponse.json(
      { error: `Invalid pipeline_stage. Must be one of: ${validStages.join(", ")}` },
      { status: 400 }
    );
  }

  // Get campaign to find account_id
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id, account_id, user_id, workspace_id")
    .eq("id", campaign_id)
    .single();

  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  // Determine account_id
  const accountId = campaign.account_id || campaign.user_id || campaign.workspace_id || user.id;

  // Verify contact exists
  const { data: contact } = await supabase
    .from("contacts")
    .select("id")
    .eq("id", params.leadId)
    .single();

  if (!contact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  // Call the RPC function to update pipeline stage
  const { error: rpcError } = await supabase.rpc("update_pipeline_stage_with_rules", {
    p_account_id: accountId,
    p_campaign_id: campaign_id,
    p_contact_id: params.leadId,
    p_pipeline_stage: pipeline_stage,
  });

  if (rpcError) {
    console.error("update_pipeline_stage_with_rules error:", rpcError);
    return NextResponse.json(
      { error: "Failed to update pipeline stage", details: rpcError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, pipeline_stage });
}
























































