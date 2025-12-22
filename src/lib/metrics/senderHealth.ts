// /lib/metrics/senderHealth.ts
import { getBrowserSupabase } from "@/lib/supabase";

export type SenderHealth = {
  window_days: number;
  sent: number;
  failed: number;
  bounce_rate_percent: number;
  replies: number;
  meetings: number;
  mb_per_100: number;
  suppression_hits: number;
};

export async function fetchSenderHealth(days: number): Promise<SenderHealth> {
  const supabase = getBrowserSupabase();
  const { data: ures, error: uerr } = await supabase.auth.getUser();
  if (uerr || !ures?.user) throw new Error("Not authenticated");
  const uid = ures.user.id;

  const { data, error } = await supabase.rpc("compute_sender_health", {
    in_profile_id: uid,
    in_days: days,
  });
  if (error) throw error;

  const row = Array.isArray(data) && data.length > 0 ? (data[0] as any) : null;
  if (!row) {
    return {
      window_days: days,
      sent: 0,
      failed: 0,
      bounce_rate_percent: 0,
      replies: 0,
      meetings: 0,
      mb_per_100: 0,
      suppression_hits: 0,
    };
  }
  return {
    window_days: Number(row.window_days ?? days),
    sent: Number(row.sent ?? 0),
    failed: Number(row.failed ?? 0),
    bounce_rate_percent: Number(row.bounce_rate_percent ?? 0),
    replies: Number(row.replies ?? 0),
    meetings: Number(row.meetings ?? 0),
    mb_per_100: Number(row.mb_per_100 ?? 0),
    suppression_hits: Number(row.suppression_hits ?? 0),
  };
} 