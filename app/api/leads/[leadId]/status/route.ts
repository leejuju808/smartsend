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
  const { lead_status, campaign_id } = body;

  if (!lead_status) {
    return NextResponse.json(
      { error: "lead_status is required" },
      { status: 400 }
    );
  }

  if (!campaign_id) {
    return NextResponse.json(
      { error: "campaign_id is required" },
      { status: 400 }
    );
  }

  // Validate lead_status enum value
  const validStatuses = [
    "new",
    "hot",
    "warm",
    "neutral",
    "cold",
    "not_interested",
    "unsubscribed",
  ];

  if (!validStatuses.includes(lead_status)) {
    return NextResponse.json(
      { error: `Invalid lead_status. Must be one of: ${validStatuses.join(", ")}` },
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

  // Update lead_status directly
  const { error: updateError, count: updateCount } = await supabase
    .from("lead_auto_follow_up_stats")
    .update({
      lead_status: lead_status,
      updated_at: new Date().toISOString(),
    })
    .eq("account_id", accountId)
    .eq("campaign_id", campaign_id)
    .eq("contact_id", params.leadId)
    .select("id", { count: "exact", head: true });

  // If update failed or no row exists, create one
  if (updateError) {
    console.error("Failed to update lead_status:", updateError);
    return NextResponse.json(
      { error: "Failed to update lead status", details: updateError.message },
      { status: 500 }
    );
  }

  // If no row was updated, insert a new one
  if (updateCount === 0) {
    const { error: insertError } = await supabase
      .from("lead_auto_follow_up_stats")
      .insert({
        account_id: accountId,
        campaign_id: campaign_id,
        contact_id: params.leadId,
        lead_status: lead_status,
      });

    if (insertError) {
      console.error("Failed to insert lead_status:", insertError);
      return NextResponse.json(
        { error: "Failed to update lead status", details: insertError.message },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ ok: true, lead_status });
}

