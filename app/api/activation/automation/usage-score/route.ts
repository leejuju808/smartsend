import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/activation/automation/usage-score
 * 
 * Trigger 3 — Usage Score
 * Tracks sending volume
 * Tracks replies
 * Tracks open rates
 * If usage low → SmartSend sends a "Quick Fix" email
 * 
 * This runs automatically via cron job to calculate usage scores.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    
    const body = await req.json().catch(() => ({}));
    const { workspace_id } = body;

    // If workspace_id provided, calculate for that workspace
    // Otherwise, calculate for all recently activated workspaces
    let workspacesToCheck: any[] = [];

    if (workspace_id) {
      const { data: activationState } = await supabase
        .from("roofer_activation_state")
        .select("id, workspace_id, user_id")
        .eq("workspace_id", workspace_id)
        .single();

      if (activationState) {
        workspacesToCheck = [activationState];
      }
    } else {
      // Get all workspaces activated in the last 30 days
      const { data: activationStates } = await supabase
        .from("roofer_activation_state")
        .select("id, workspace_id, user_id")
        .not("activation_started_at", "is", null)
        .gte("activation_started_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

      workspacesToCheck = activationStates || [];
    }

    const results = [];

    for (const activationState of workspacesToCheck) {
      const wsId = activationState.workspace_id;
      const userId = activationState.user_id;

      // Get email stats from last 30 days
      const { data: emailLogs } = await supabase
        .from("email_logs")
        .select("id, status, opened_at")
        .eq("workspace_id", wsId)
        .gte("sent_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

      const emailsSent = emailLogs?.length || 0;
      const repliesReceived = emailLogs?.filter((log) => log.status === "replied").length || 0;
      const opens = emailLogs?.filter((log) => log.opened_at).length || 0;
      const openRate = emailsSent > 0 ? (opens / emailsSent) * 100 : 0;
      const replyRate = emailsSent > 0 ? (repliesReceived / emailsSent) * 100 : 0;

      // Get active campaigns
      const { data: activeCampaigns, count: activeCampaignsCount } = await supabase
        .from("campaigns")
        .select("id", { count: "exact" })
        .eq("workspace_id", wsId)
        .in("status", ["active", "scheduled"]);

      const campaignsActive = activeCampaignsCount || 0;

      // Calculate usage score (0-100)
      // Base score from emails sent (max 40 points)
      let usageScore = Math.min(Math.floor(emailsSent / 10), 40);

      // Add points for replies (max 30 points)
      if (repliesReceived > 0) {
        usageScore += Math.min(repliesReceived * 3, 30);
      }

      // Add points for open rate (max 20 points)
      if (openRate > 0) {
        usageScore += Math.min(Math.floor(openRate / 5), 20);
      }

      // Add points for active campaigns (max 10 points)
      usageScore += Math.min(campaignsActive * 5, 10);

      usageScore = Math.min(usageScore, 100);

      // Flag low usage (score < 20)
      const isLowUsage = usageScore < 20;

      // Upsert usage score
      const { data: existingScore } = await supabase
        .from("activation_usage_scores")
        .select("id")
        .eq("activation_state_id", activationState.id)
        .maybeSingle();

      const scoreData = {
        activation_state_id: activationState.id,
        workspace_id: wsId,
        user_id: userId,
        emails_sent_count: emailsSent,
        replies_received_count: repliesReceived,
        open_rate: openRate,
        reply_rate: replyRate,
        campaigns_active_count: campaignsActive,
        usage_score: usageScore,
        is_low_usage: isLowUsage,
        calculated_at: new Date().toISOString(),
      };

      if (existingScore) {
        await supabase
          .from("activation_usage_scores")
          .update(scoreData)
          .eq("id", existingScore.id);
      } else {
        await supabase.from("activation_usage_scores").insert(scoreData);
      }

      // Send "Quick Fix" email if low usage and not already notified
      if (isLowUsage) {
        const { data: currentScore } = await supabase
          .from("activation_usage_scores")
          .select("low_usage_notified_at")
          .eq("activation_state_id", activationState.id)
          .single();

        if (!currentScore?.low_usage_notified_at) {
          // Mark as notified
          await supabase
            .from("activation_usage_scores")
            .update({
              low_usage_notified_at: new Date().toISOString(),
            })
            .eq("activation_state_id", activationState.id);

          // TODO: Send "Quick Fix" email
          // "Your usage score is low. Here are some quick tips to get more value from SmartSend..."
        }
      }

      results.push({
        workspace_id: wsId,
        usage_score: usageScore,
        emails_sent: emailsSent,
        replies_received: repliesReceived,
        open_rate: openRate,
        campaigns_active: campaignsActive,
        is_low_usage: isLowUsage,
      });
    }

    return NextResponse.json({
      success: true,
      calculated: results.length,
      results,
    });
  } catch (error: any) {
    console.error("Error in usage-score:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}






































