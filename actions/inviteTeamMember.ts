"use server";

import { createClient } from "@/lib/supabase/server";
import { getOrCreateMyTeam } from "./getOrCreateMyTeam";

export async function inviteTeamMember(email: string, role: "admin" | "member" = "member") {
  const supabase = createClient();

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Not authenticated");

  const team = await getOrCreateMyTeam();

  // Only owner/admin can invite
  const { data: meMembership } = await supabase
    .from("smartsend_team_members")
    .select("*")
    .eq("team_id", team.id)
    .eq("user_id", user.id)
    .single();

  if (!meMembership || !["owner", "admin"].includes(meMembership.role)) {
    throw new Error("Not allowed to invite members");
  }

  // Find user by email in auth.users via RPC
  const { data: usersByEmail, error: uErr } = await supabase.rpc("find_user_by_email", {
    p_email: email
  });

  if (uErr) throw uErr;

  const target = usersByEmail?.[0];
  if (!target) {
    throw new Error("User with that email does not exist. Ask them to sign up first.");
  }

  const { data: member, error: mErr } = await supabase
    .from("smartsend_team_members")
    .upsert(
      {
        team_id: team.id,
        user_id: target.id,
        role
      },
      { onConflict: "team_id,user_id" }
    )
    .select()
    .single();

  if (mErr) throw mErr;

  return member;
}








