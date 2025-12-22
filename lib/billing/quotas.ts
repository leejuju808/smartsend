import { SupabaseClient } from "@supabase/supabase-js";

export type QuotaCheckResult = {
  allowed: boolean;
  reason?: string;
  workspaceRemaining?: number;
  senderRemaining?: number;
};

/**
 * Check send quota for workspace and optional sender (connected inbox).
 * Returns whether sending is allowed and remaining quota counts.
 */
export async function checkSendQuota(opts: {
  supabase: SupabaseClient;
  workspaceId: string;
  senderId?: string | null; // e.g. connected inbox id (account_id)
}): Promise<QuotaCheckResult> {
  const { supabase, workspaceId, senderId } = opts;

  // 1) Get limits
  const { data: limits, error: limitsErr } = await supabase
    .from("workspace_billing_limits")
    .select(
      "daily_send_cap, per_sender_daily_cap, hard_stop"
    )
    .eq("workspace_id", workspaceId)
    .single();

  // If no limits row yet, treat as unlimited for now
  if (limitsErr || !limits) {
    return { allowed: true };
  }

  const now = new Date();
  const startOfDay = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    0,
    0,
    0,
    0
  ).toISOString();
  const endOfDay = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    23,
    59,
    59,
    999
  ).toISOString();

  // 2) Workspace sends today
  // Note: send_logs doesn't have workspace_id directly, so we join through campaigns
  // Get campaigns first, then count sends
  const { data: campaigns } = await supabase
    .from("campaigns")
    .select("id")
    .eq("workspace_id", workspaceId);

  const campaignIds = campaigns?.map(c => c.id) || [];

  let wsCount = 0;
  if (campaignIds.length > 0) {
    const { count, error } = await supabase
      .from("send_logs")
      .select("id", { head: true, count: "exact" })
      .in("campaign_id", campaignIds)
      .eq("status", "sent")
      .gte("sent_at", startOfDay)
      .lte("sent_at", endOfDay);

    if (error) {
      console.error("quota: workspace count error", error);
      return { allowed: true }; // fail open for now
    }
    wsCount = count ?? 0;
  }

  const workspaceRemaining = Math.max(
    0,
    limits.daily_send_cap - wsCount
  );

  // 3) Sender sends today (if provided)
  let senderRemaining: number | undefined;
  if (senderId) {
    const { count: senderCount, error: senderErr } = await supabase
      .from("send_logs")
      .select("id", { head: true, count: "exact" })
      .eq("account_id", senderId)
      .eq("status", "sent")
      .gte("sent_at", startOfDay)
      .lte("sent_at", endOfDay);

    if (!senderErr) {
      senderRemaining = Math.max(
        0,
        limits.per_sender_daily_cap - (senderCount ?? 0)
      );
    }
  }

  // 4) Decide
  const workspaceOver = workspaceRemaining <= 0;
  const senderOver =
    typeof senderRemaining === "number" && senderRemaining <= 0;

  if (!workspaceOver && !senderOver) {
    return {
      allowed: true,
      workspaceRemaining,
      senderRemaining,
    };
  }

  const reason = workspaceOver
    ? "workspace_daily_cap_reached"
    : "sender_daily_cap_reached";

  if (!limits.hard_stop) {
    // we just warn (UI can show reason, but dispatcher keeps going)
    return {
      allowed: true,
      reason,
      workspaceRemaining,
      senderRemaining,
    };
  }

  return {
    allowed: false,
    reason,
    workspaceRemaining,
    senderRemaining,
  };
}

