import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function loadSendWindowFor(org_id: string, enrollment?: {
  send_tz?: string | null;
  send_window_start?: number | null;
  send_window_end?: number | null;
  send_weekdays?: number[] | null;
}) {
  if (enrollment?.send_tz || enrollment?.send_window_start != null || enrollment?.send_weekdays) {
    return {
      timezone: enrollment.send_tz || "UTC",
      start: enrollment.send_window_start ?? 9,
      end: enrollment.send_window_end ?? 17,
      weekdays: enrollment.send_weekdays ?? [1,2,3,4,5],
    };
  }
  const { data: s } = await supabaseAdmin
    .from("org_send_settings")
    .select("timezone, window_start, window_end, weekdays")
    .eq("org_id", org_id)
    .maybeSingle();
  return {
    timezone: s?.timezone || "UTC",
    start: s?.window_start ?? 9,
    end: s?.window_end ?? 17,
    weekdays: s?.weekdays ?? [1,2,3,4,5],
  };
}