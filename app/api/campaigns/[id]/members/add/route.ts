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
  const email: string | undefined = body.email;
  const role: "owner" | "editor" | "viewer" = body.role || "editor";

  if (!email) {
    return NextResponse.json({ error: "email_required" }, { status: 400 });
  }

  const { data: campaign, error: campErr } = await supabase
    .from("campaigns")
    .select("id, workspace_id, name")
    .eq("id", campaignId)
    .single();

  if (campErr || !campaign) {
    return NextResponse.json({ error: "campaign_not_found" }, { status: 404 });
  }

  // verify caller is in workspace and is at least editor/owner
  const { data: membership, error: memErr } = await supabase
    .from("team_members")
    .select("workspace_id, role")
    .eq("workspace_id", campaign.workspace_id)
    .eq("user_id", user.id)
    .single();

  if (memErr || !membership) {
    return NextResponse.json({ error: "no_access" }, { status: 403 });
  }

  // find target user by email
  const { data: targetProfile, error: profErr } = await supabase
    .from("profiles")
    .select("id, email, full_name")
    .ilike("email", email)
    .maybeSingle();

  if (profErr || !targetProfile) {
    return NextResponse.json(
      { error: "user_not_found_for_email" },
      { status: 404 }
    );
  }

  // ensure target is in same workspace
  const { data: targetMember, error: targetMemErr } = await supabase
    .from("team_members")
    .select("user_id")
    .eq("workspace_id", campaign.workspace_id)
    .eq("user_id", targetProfile.id)
    .maybeSingle();

  if (targetMemErr || !targetMember) {
    return NextResponse.json(
      { error: "user_not_in_workspace" },
      { status: 400 }
    );
  }

  const { data: cm, error } = await supabase
    .from("campaign_members")
    .upsert(
      {
        workspace_id: campaign.workspace_id,
        campaign_id: campaign.id,
        user_id: targetProfile.id,
        role,
      },
      {
        onConflict: "workspace_id,campaign_id,user_id",
      }
    )
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error }, { status: 400 });
  }

  return NextResponse.json(
    {
      member: cm,
      profile: targetProfile,
    },
    { status: 200 }
  );
}




