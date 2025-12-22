import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const campaignId = params.id;

  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user;

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // find workspace via campaign + team_members
  const { data: campaign, error: campErr } = await supabase
    .from("campaigns")
    .select("id, workspace_id, name")
    .eq("id", campaignId)
    .single();

  if (campErr || !campaign) {
    return NextResponse.json({ error: "campaign_not_found" }, { status: 404 });
  }

  // verify user is part of workspace
  const { data: membership, error: memErr } = await supabase
    .from("team_members")
    .select("workspace_id, role")
    .eq("workspace_id", campaign.workspace_id)
    .eq("user_id", user.id)
    .single();

  if (memErr || !membership) {
    return NextResponse.json({ error: "no_access" }, { status: 403 });
  }

  const { data: members, error } = await supabase
    .from("campaign_members")
    .select(
      `
      id,
      user_id,
      role,
      created_at,
      profiles:user_id ( full_name, email )
    `
    )
    .eq("workspace_id", campaign.workspace_id)
    .eq("campaign_id", campaign.id)
    .order("role", { ascending: true });

  if (error) {
    return NextResponse.json({ error }, { status: 400 });
  }

  return NextResponse.json(
    {
      campaign: {
        id: campaign.id,
        name: campaign.name,
      },
      members: members || [],
    },
    { status: 200 }
  );
}


