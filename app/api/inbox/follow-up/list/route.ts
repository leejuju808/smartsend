import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(req: Request) {
  const supabase = createRouteHandlerClient({ cookies });

  // Get current user
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get workspace via team_members
  const { data: membership, error: memErr } = await supabase
    .from("team_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .single();

  if (memErr || !membership) {
    return NextResponse.json({ error: "no_workspace" }, { status: 400 });
  }

  const workspaceId = membership.workspace_id;

  // Get campaign IDs for this workspace
  const { data: campaigns, error: campaignsError } = await supabase
    .from("campaigns")
    .select("id")
    .eq("workspace_id", workspaceId);

  if (campaignsError) {
    return NextResponse.json({ error: campaignsError.message }, { status: 500 });
  }

  const campaignIds = campaigns?.map((c) => c.id) || [];
  if (campaignIds.length === 0) {
    return NextResponse.json({ items: [] });
  }

  const { data, error } = await supabase
    .from("campaign_leads")
    .select(`
      id,
      follow_up_at,
      follow_up_completed,
      follow_up_notes,
      replied_at,
      last_reply_event_id,
      last_reply_reason,
      leads (
        id,
        first_name,
        last_name,
        email,
        company
      ),
      campaigns (
        id,
        name
      ),
      email_events:last_reply_event_id (
        id,
        body_text,
        created_at
      )
    `)
    .eq("last_reply_reason", "follow_up_later")
    .in("campaign_id", campaignIds)
    .order("follow_up_at", { ascending: true, nullsLast: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ items: data || [] });
}



