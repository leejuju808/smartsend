import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = createClient();

  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user;

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Find workspace via team_members
  const { data: membership, error: memErr } = await supabase
    .from("team_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (memErr || !membership) {
    return NextResponse.json({ error: "no_workspace" }, { status: 403 });
  }

  // Get all global rules (campaign_id is null) for this workspace
  const { data: rules, error } = await supabase
    .from("reply_followup_rules")
    .select("*")
    .eq("workspace_id", membership.workspace_id)
    .is("campaign_id", null)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ rules: rules || [] }, { status: 200 });
}







