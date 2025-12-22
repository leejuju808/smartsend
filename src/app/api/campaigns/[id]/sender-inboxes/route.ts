import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(_: NextRequest, { params }: { params: { id: string }}) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Get campaign to find workspace_id
  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .select("workspace_id")
    .eq("id", params.id)
    .single();

  if (campaignError || !campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  // Fetch inboxes for this workspace
  const { data: inboxes, error } = await supabase
    .from("sender_inboxes")
    .select("id, email, domain_id")
    .eq("workspace_id", campaign.workspace_id)
    .eq("connected", true)
    .order("email", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ inboxes: inboxes || [] });
}



