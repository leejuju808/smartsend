// app/api/trial/start/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: membership, error } = await supabase
    .from("workspace_members")
    .select("workspace_id, workspaces(is_trial_active)")
    .eq("user_id", user.id)
    .eq("is_default", true)
    .single();

  if (error || !membership) {
    return NextResponse.json({ error: "No workspace" }, { status: 404 });
  }

  const workspaceId = membership.workspace_id;
  const ws = membership.workspaces as any;

  if (ws.is_trial_active) {
    return NextResponse.json({ error: "Trial already active" }, { status: 400 });
  }

  const now = new Date();
  const ends = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  await supabase
    .from("workspaces")
    .update({
      is_trial_active: true,
      trial_ends_at: ends.toISOString(),
    })
    .eq("id", workspaceId);

  return NextResponse.json({ ok: true, trial_ends_at: ends.toISOString() });
}



























































