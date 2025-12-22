// lib/notifications/getNotificationSettings.ts
// Block 16200 — Helper to load notification settings from workspace

import { createClient } from "@/lib/supabase/server";

export async function getNotificationSettings(workspaceId: string) {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("workspaces")
    .select("notification_settings")
    .eq("id", workspaceId)
    .single();

  if (error || !data) {
    return {
      instant_hot_lead_email: true,
      instant_any_reply_email: false,
      daily_summary_email: true,
    };
  }

  const ns = data.notification_settings || {};
  return {
    instant_hot_lead_email: ns.instant_hot_lead_email ?? true,
    instant_any_reply_email: ns.instant_any_reply_email ?? false,
    daily_summary_email: ns.daily_summary_email ?? true,
  };
}



























































