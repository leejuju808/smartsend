// app/api/billing/workspace/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: membership, error } = await supabase
    .from("workspace_members")
    .select("workspace_id, workspaces(plan_key, plan_renews_at, is_founder, founder_discount_pct, is_trial_active, trial_ends_at)")
    .eq("user_id", user.id)
    .eq("is_default", true)
    .single();

  if (error || !membership)
    return NextResponse.json({ error: "No workspace" }, { status: 404 });

  return NextResponse.json({ workspace: membership.workspaces });
}

