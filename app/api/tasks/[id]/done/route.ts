import { createClient } from "@/utils/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const taskId = params.id;

  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes?.user;

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get user's workspace membership
  const { data: membership } = await supabase
    .from("team_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .single();

  if (!membership) {
    return NextResponse.json(
      { error: "No workspace membership found" },
      { status: 400 }
    );
  }

  const ws = membership.workspace_id;

  const { error } = await supabase
    .from("tasks")
    .update({ status: "done" })
    .eq("id", taskId)
    .eq("workspace_id", ws)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}






