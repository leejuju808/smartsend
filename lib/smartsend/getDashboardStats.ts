import { createClient } from "@/lib/supabase/server";

export async function getDashboardStats() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Not authenticated");

  const today = new Date().toISOString().slice(0, 10);

  // 1) Today's campaign stats (sum across all campaigns)
  const { data: todayStats } = await supabase
    .from("smartsend_campaign_stats")
    .select("emails_sent, replies, failures, opens, clicks")
    .gte("date", today)
    .lte("date", today);

  const totals = (todayStats || []).reduce(
    (acc, s) => {
      acc.emails_sent += s.emails_sent || 0;
      acc.replies += s.replies || 0;
      acc.failures += s.failures || 0;
      acc.opens += s.opens || 0;
      acc.clicks += s.clicks || 0;
      return acc;
    },
    { emails_sent: 0, replies: 0, failures: 0, opens: 0, clicks: 0 }
  );

  // 2) Top 5 active campaigns (by total_sent)
  const { data: campaigns } = await supabase
    .from("campaigns")
    .select("id, name, status, total_sent, total_replies, total_opens, total_clicks")
    .eq("user_id", user.id)
    .order("total_sent", { ascending: false })
    .limit(5);

  // 3) Warmup accounts
  const { data: warmup } = await supabase
    .from("smartsend_warmup_accounts")
    .select("*")
    .eq("user_id", user.id)
    .eq("is_enabled", true);

  // 4) Sending accounts for safety widget (Block 10000)
  const { data: sendingAccounts } = await supabase
    .from("smartsend_sending_accounts")
    .select("id, status, sent_today, daily_limit")
    .eq("user_id", user.id);

  // 5) Recent activity: logs for last 24h (simple)
  const yesterday = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data: logs } = await supabase
    .from("logs")
    .select("id, source, message, created_at")
    .eq("user_id", user.id)
    .gte("created_at", yesterday)
    .order("created_at", { ascending: false })
    .limit(25);

  return {
    totals,
    campaigns: campaigns || [],
    warmup: warmup || [],
    sendingAccounts: sendingAccounts || [],
    logs: (logs || []).map((log) => ({
      ...log,
      scope: log.source, // Map source to scope for UI compatibility
    })),
  };
}

