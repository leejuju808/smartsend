import { createSupabaseServer } from "@/lib/supabaseServer";
import { sendNotification } from "./notify";
import { getUserPlan } from "@/lib/plan";

// Plan-based send limits
const PLAN_LIMITS = {
  solo: 100, // Solo: 100 emails/day
  team: 1000, // Team: 1000 emails/day
};

export async function checkDailyQuota(workspaceId: string, userId?: string, maxPerDay?: number) {
  const supabase = createSupabaseServer();

  // If maxPerDay not provided, determine from user plan
  if (maxPerDay === undefined && userId) {
    const plan = await getUserPlan(userId);
    maxPerDay = PLAN_LIMITS[plan];
  }

  // Default to solo limit if no userId provided
  const effectiveLimit = maxPerDay ?? PLAN_LIMITS.solo;

  const today = new Date().toISOString().split("T")[0];
  let { data: usage } = await supabase
    .from("send_quota_usage")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("date", today)
    .single();

  if (!usage) {
    const { data: newRow } = await supabase
      .from("send_quota_usage")
      .insert({ workspace_id: workspaceId, date: today, sent_count: 0 })
      .select()
      .single();
    usage = newRow;
  }

  if (usage.sent_count >= effectiveLimit)
    throw new Error(`Daily quota (${effectiveLimit}) reached. Upgrade to Team for higher limits.`);

  // Check for quota warning (within 10 emails of limit)
  if (usage.sent_count >= effectiveLimit - 10) {
    // Get workspace owner email for notification
    const { data: workspace } = await supabase
      .from("workspaces")
      .select("owner_email")
      .eq("id", workspaceId)
      .single();
    
    if (workspace?.owner_email) {
      await sendNotification(
        workspace.owner_email, 
        "quota", 
        "Quota Warning", 
        `You're within ${effectiveLimit - usage.sent_count} emails of your daily sending limit.`
      );
    }
  }

  await supabase
    .from("send_quota_usage")
    .update({ sent_count: usage.sent_count + 1 })
    .eq("id", usage.id);
}