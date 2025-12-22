import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const campaignId = params.id;
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user;

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const memberId: string | undefined = body.memberId;
  const newRole: string | undefined = body.role;
  const remove: boolean = body.remove === true;

  if (!memberId) {
    return NextResponse.json({ error: "memberId_required" }, { status: 400 });
  }

  const { data: campaign, error: campErr } = await supabase
    .from("campaigns")
    .select("id, workspace_id")
    .eq("id", campaignId)
    .single();

  if (campErr || !campaign) {
    return NextResponse.json({ error: "campaign_not_found" }, { status: 404 });
  }

  // verify caller is in workspace
  const { data: membership, error: memErr } = await supabase
    .from("team_members")
    .select("workspace_id, role")
    .eq("workspace_id", campaign.workspace_id)
    .eq("user_id", user.id)
    .single();

  if (memErr || !membership) {
    return NextResponse.json({ error: "no_access" }, { status: 403 });
  }

  if (remove) {
    const { error } = await supabase
      .from("campaign_members")
      .delete()
      .eq("id", memberId)
      .eq("workspace_id", campaign.workspace_id)
      .eq("campaign_id", campaign.id);

    if (error) return NextResponse.json({ error }, { status: 400 });

    return NextResponse.json({ ok: true }, { status: 200 });
  }

  if (!newRole) {
    return NextResponse.json({ error: "role_required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("campaign_members")
    .update({ role: newRole })
    .eq("id", memberId)
    .eq("workspace_id", campaign.workspace_id)
    .eq("campaign_id", campaign.id);

  if (error) return NextResponse.json({ error }, { status: 400 });

  return NextResponse.json({ ok: true }, { status: 200 });
}







