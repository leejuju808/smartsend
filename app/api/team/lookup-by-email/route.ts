import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { email, campaignId } = await req.json();

  // Find campaign's workspace
  const { data: campaign, error: campErr } = await supabase
    .from("campaigns")
    .select("workspace_id")
    .eq("id", campaignId)
    .single();

  if (campErr || !campaign) {
    return NextResponse.json(
      { error: "Campaign not found." },
      { status: 404 }
    );
  }

  // Find team member in that workspace by email
  const { data: member, error: memberErr } = await supabase
    .from("team_members")
    .select("user_id, email")
    .eq("workspace_id", campaign.workspace_id)
    .eq("email", email)
    .eq("status", "active")
    .single();

  if (memberErr || !member) {
    return NextResponse.json(
      { error: "No team member with that email in this workspace." },
      { status: 404 }
    );
  }

  return NextResponse.json({ userId: member.user_id }, { status: 200 });
}








