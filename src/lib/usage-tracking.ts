import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Record usage for metered billing (emails_sent, ai_credits)
 * This should be called after successfully sending an email or using AI features
 */
export async function recordUsage(
  workspaceId: string,
  metricName: "emails_sent" | "ai_credits",
  quantity: number = 1
): Promise<void> {
  try {
    // Call the database function to handle credits and metered billing
    const { error } = await supabase.rpc("record_usage_with_credits", {
      p_workspace_id: workspaceId,
      p_metric_name: metricName,
      p_quantity: quantity,
    });

    if (error) {
      console.error(`Failed to record usage for ${metricName}:`, error);
      // Don't throw - usage tracking shouldn't break email sending
    }
  } catch (error) {
    console.error(`Error recording usage:`, error);
    // Non-critical error
  }
}

/**
 * Check for milestone achievements and trigger growth loop notifications
 */
export async function checkMilestones(workspaceId: string): Promise<void> {
  try {
    // Get recent reply count
    const { data: recentReplies } = await supabase
      .from("email_events")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("event_type", "reply")
      .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    const replyCount = recentReplies?.length || 0;

    // Check if we've already sent notifications for these milestones
    const { data: existingEvents } = await supabase
      .from("growth_loop_events")
      .select("milestone_type")
      .eq("workspace_id", workspaceId)
      .eq("event_type", "win_notification");

    const sentMilestones = new Set(
      existingEvents?.map((e) => e.milestone_type) || []
    );

    // Trigger notifications for new milestones
    if (replyCount === 1 && !sentMilestones.has("first_reply")) {
      await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/growth-loops/win-notification`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspace_id: workspaceId,
          milestone_type: "first_reply",
        }),
      });
    } else if (replyCount === 10 && !sentMilestones.has("ten_replies")) {
      await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/growth-loops/win-notification`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspace_id: workspaceId,
          milestone_type: "ten_replies",
        }),
      });
    }
  } catch (error) {
    console.error("Error checking milestones:", error);
    // Non-critical
  }
}

