import { SupabaseClient } from "@supabase/supabase-js";

export type ReplyCapInfo = {
  dailyCap: number | null; // null = unmetered
  usedToday: number;
  remaining: number | null; // null = unmetered
};

/**
 * Get workspace reply cap info (daily cap, usage today, remaining).
 * Returns null for dailyCap/remaining if no cap is set (unlimited).
 */
export async function getWorkspaceReplyCap(
  supabase: SupabaseClient,
  workspaceId: string
): Promise<ReplyCapInfo> {
  // 1) Plan limits
  const { data: limitsRow, error: limitsErr } = await supabase
    .from("workspace_billing_limits")
    .select("daily_reply_cap")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (limitsErr) {
    console.error("billing reply limits error", limitsErr);
  }

  const dailyCap =
    limitsRow?.daily_reply_cap && limitsRow.daily_reply_cap > 0
      ? limitsRow.daily_reply_cap
      : null; // null = no cap

  // 2) Today reply usage from view
  const { data: usageRow, error: usageErr } = await supabase
    .from("workspace_reply_usage_today")
    .select("replies_count")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (usageErr) {
    console.error("reply usage today error", usageErr);
  }

  const usedToday = usageRow?.replies_count || 0;

  if (dailyCap === null) {
    return {
      dailyCap: null,
      usedToday,
      remaining: null,
    };
  }

  const remaining = Math.max(dailyCap - usedToday, 0);

  return {
    dailyCap,
    usedToday,
    remaining,
  };
}

/**
 * Log a reply_cap_reached event for Billing UI / upgrade CTA.
 * Only logs if dailyCap is set (not null).
 */
export async function logReplyCapReached(
  supabase: SupabaseClient,
  workspaceId: string,
  caps: ReplyCapInfo
): Promise<void> {
  if (caps.dailyCap == null) return;

  await supabase.from("billing_usage_events").insert({
    workspace_id: workspaceId,
    event_type: "reply_cap_reached",
    payload: {
      daily_cap: caps.dailyCap,
      used_today: caps.usedToday,
      at: new Date().toISOString(),
    },
  });
}





