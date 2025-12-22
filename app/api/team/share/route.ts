import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const sb = createClient();
  const { campaign_id, permission } = await req.json();

  const { data: user } = await sb.auth.getUser();
  if (!user?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get user's team membership
  const { data: member } = await sb
    .from("team_members")
    .select("team_id, role")
    .eq("user_id", user.user.id)
    .single();

  if (!member) {
    return NextResponse.json({ error: "not_in_team" }, { status: 403 });
  }

  // Verify user has permission to create shares (owner/admin)
  if (!['owner', 'admin'].includes(member.role)) {
    return NextResponse.json({ error: "insufficient_permissions" }, { status: 403 });
  }

  // Verify campaign exists and user has access
  const { data: campaign } = await sb
    .from("campaigns")
    .select("id, team_id")
    .eq("id", campaign_id)
    .single();

  if (!campaign) {
    return NextResponse.json({ error: "campaign_not_found" }, { status: 404 });
  }

  // Create share
  const { data, error } = await sb
    .from("campaign_shares")
    .insert({
      team_id: member.team_id,
      campaign_id,
      permission: permission ?? "view"
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ data, error: null });
}















