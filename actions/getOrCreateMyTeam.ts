"use server";

import { createClient } from "@/lib/supabase/server";

export async function getOrCreateMyTeam() {
  const supabase = createClient();

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Not authenticated");

  // Try to find existing team
  const { data: existing } = await supabase
    .from("smartsend_teams")
    .select("*")
    .eq("owner_id", user.id)
    .limit(1)
    .maybeSingle();

  if (existing) {
    return existing;
  }

  // Create new team
  const { data: team, error: teamErr } = await supabase
    .from("smartsend_teams")
    .insert({
      owner_id: user.id,
      name: `${user.email}'s Team`
    })
    .select()
    .single();

  if (teamErr) throw teamErr;

  // Add owner as member
  const { error: memberErr } = await supabase
    .from("smartsend_team_members")
    .insert({
      team_id: team.id,
      user_id: user.id,
      role: "owner"
    });

  if (memberErr) throw memberErr;

  return team;
}








