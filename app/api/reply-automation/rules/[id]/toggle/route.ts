import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const ruleId = params.id;

  const body = await req.json();
  const isEnabled: boolean | undefined = body.isEnabled;

  if (typeof isEnabled !== "boolean") {
    return NextResponse.json(
      { error: "isEnabled must be a boolean" },
      { status: 400 }
    );
  }

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

  const { error } = await supabase
    .from("reply_followup_rules")
    .update({ is_enabled: isEnabled })
    .eq("id", ruleId)
    .eq("workspace_id", membership.workspace_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}







