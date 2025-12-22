// /lib/metrics/attributedMeetings.ts
import { getBrowserSupabase } from "@/lib/supabase";

export type AttributedMeeting = {
  campaign_id: string | null;
  campaign_name: string | null;
  meetings: number;
};

export async function fetchAttributedMeetings(): Promise<AttributedMeeting[]> {
  const supabase = getBrowserSupabase();
  const { data: ures, error: uerr } = await supabase.auth.getUser();
  if (uerr || !ures?.user) throw new Error("Not authenticated");
  const uid = ures.user.id;

  // First run attribution RPC to update campaign_id links
  await supabase.rpc("attribute_meeting_campaigns", { in_profile_id: uid });

  // Fetch summary
  const { data, error } = await supabase
    .from("meetings_by_campaign")
    .select("campaign_id, campaign_name, meetings")
    .eq("profile_id", uid);
  if (error) throw error;

  return (data || []) as AttributedMeeting[];
} 