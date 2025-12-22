import { cookies, headers } from "next/headers";
import { getServerSupabase } from "@/src/lib/supabase/server";

/**
 * Get the current team ID from cookie or user's first team
 */
export async function getCurrentTeamId(): Promise<string | null> {
  const cookieStore = await cookies();
  const teamId = cookieStore.get("current_team_id")?.value || headers().get("x-team-id") || null;
  
  if (teamId) return teamId;

  // Fallback: get user's first team
  const supabase = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: membership } = await supabase
    .from("team_members")
    .select("team_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return membership?.team_id || null;
}


































