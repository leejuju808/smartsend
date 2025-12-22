import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(_req: NextRequest) {
  const supabase = createClient();

  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes?.user;
  if (!user) {
    return Response.json({ error: "not_auth" }, { status: 401 });
  }

  // 1) workspace via team_members
  const { data: membership, error: memErr } = await supabase
    .from("team_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .single();

  if (memErr || !membership) {
    return Response.json({ error: "no_workspace" }, { status: 400 });
  }

  const workspaceId = membership.workspace_id;

  // 2) seat_limit from workspace_billing_limits
  const [{ data: limitsRow, error: limitsError }, { data: members, error: membersError }] = await Promise.all([
    supabase
      .from("workspace_billing_limits")
      .select("seat_limit")
      .eq("workspace_id", workspaceId)
      .maybeSingle(),
    supabase
      .from("team_members")
      .select("id")
      .eq("workspace_id", workspaceId),
  ]);

  if (membersError) {
    return Response.json({ error: "failed_to_count_members" }, { status: 500 });
  }

  const seatLimit = limitsRow?.seat_limit ?? null;
  const seatsUsed = members?.length ?? 0;

  const canAddMember =
    seatLimit === null || seatLimit === 0 ? true : seatsUsed < seatLimit;

  return Response.json(
    {
      seats_used: seatsUsed,
      seat_limit: seatLimit,
      can_add_member: canAddMember,
    },
    { status: 200 }
  );
}

