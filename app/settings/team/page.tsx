import { getOrCreateMyTeam } from "@/actions/getOrCreateMyTeam";
import { createClient } from "@/lib/supabase/server";
import { TeamSettingsClient } from "./TeamSettingsClient";

export default async function TeamSettingsPage() {
  const supabase = createClient();
  const team = await getOrCreateMyTeam();

  // Get team members
  const { data: members } = await supabase
    .from("smartsend_team_members")
    .select("*")
    .eq("team_id", team.id)
    .order("created_at", { ascending: false });

  return <TeamSettingsClient team={team} initialMembers={members ?? []} />;
}

