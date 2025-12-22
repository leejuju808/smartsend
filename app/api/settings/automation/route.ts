// app/api/settings/automation/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id, workspaces(auto_workflows)")
    .eq("user_id", user.id)
    .eq("is_default", true)
    .single();

  const auto =
    membership?.workspaces?.auto_workflows || {
      on_reply_create_task: true,
      on_hot_lead_stage_change: true,
      on_warm_lead_stage_change: true,
      on_won_log_revenue: true,
    };

  return NextResponse.json({ auto_workflows: auto });
}

export async function POST(req: Request) {
  const supabase = createClient();
  const body = await req.json();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: membership, error } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .eq("is_default", true)
    .single();

  if (error || !membership)
    return NextResponse.json({ error: "No workspace" }, { status: 404 });

  await supabase
    .from("workspaces")
    .update({ auto_workflows: body })
    .eq("id", membership.workspace_id);

  return NextResponse.json({ ok: true });
}



























































