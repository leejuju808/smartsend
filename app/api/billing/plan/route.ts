import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(_req: NextRequest) {
  const supabase = createClient();

  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes?.user;
  if (!user) {
    return Response.json({ error: "not_auth" }, { status: 401 });
  }

  const { data: membership, error: memErr } = await supabase
    .from("team_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .single();

  // Fallback to workspace_members if team_members doesn't have a match
  let workspaceId: string | null = null;
  if (membership) {
    workspaceId = membership.workspace_id;
  } else {
    const { data: wsMember } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();
    
    if (wsMember) {
      workspaceId = wsMember.workspace_id;
    }
  }

  if (!workspaceId) {
    return Response.json({ error: "no_workspace" }, { status: 400 });
  }

  const { data: state, error: stateErr } = await supabase
    .from("workspace_billing_state")
    .select(
      "workspace_id, plan_id, override_daily_send_cap, override_daily_reply_cap, override_seat_limit, subscription_status, trial_ends_at, cancel_at, current_period_end"
    )
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (stateErr) {
    return Response.json({ error: "state_error" }, { status: 400 });
  }

  if (!state) {
    return Response.json(
      {
        plan: null,
        state: null,
      },
      { status: 200 }
    );
  }

  const { data: plan, error: planErr } = await supabase
    .from("billing_plans")
    .select(
      "id, name, description, daily_send_cap, daily_reply_cap, seat_limit"
    )
    .eq("id", state.plan_id)
    .maybeSingle();

  if (planErr) {
    return Response.json({ error: "plan_error" }, { status: 400 });
  }

  return Response.json(
    {
      plan,
      state,
    },
    { status: 200 }
  );
}

