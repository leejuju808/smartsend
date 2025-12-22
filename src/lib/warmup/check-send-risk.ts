/**
 * Check if sending should be paused based on warmup risk score
 * This is called from the send worker/orchestrator before processing batches
 */

import { createClient } from "@supabase/supabase-js";

export interface SendRiskCheck {
  canSend: boolean;
  riskLevel: "low" | "medium" | "high" | null;
  riskScore: number | null;
  suggestedDailyLimit: number | null;
  reason?: string;
}

/**
 * Check if an account can send based on risk score and daily limit
 */
export async function checkSendRisk(
  accountId: string,
  sentToday: number = 0
): Promise<SendRiskCheck> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: account, error } = await supabase
    .from("connected_accounts")
    .select("id, last_risk_score, suggested_daily_limit")
    .eq("id", accountId)
    .single();

  if (error || !account) {
    // If account not found or no risk data, allow sending (graceful degradation)
    return {
      canSend: true,
      riskLevel: null,
      riskScore: null,
      suggestedDailyLimit: null,
    };
  }

  const riskScore = account.last_risk_score;
  const suggestedLimit = account.suggested_daily_limit;

  // If no risk score, allow sending
  if (riskScore === null || riskScore === undefined) {
    return {
      canSend: true,
      riskLevel: null,
      riskScore: null,
      suggestedDailyLimit: suggestedLimit,
    };
  }

  const riskLevel: "low" | "medium" | "high" =
    riskScore < 40 ? "high" : riskScore < 70 ? "medium" : "low";

  // HIGH RISK: Block if over suggested limit
  if (riskLevel === "high") {
    const limit = suggestedLimit || 50;
    if (sentToday >= limit) {
      return {
        canSend: false,
        riskLevel: "high",
        riskScore,
        suggestedDailyLimit: limit,
        reason: `Daily send limit reached for high-risk account. Suggested max: ${limit} emails/day.`,
      };
    }
  }

  // MEDIUM RISK: Warn but allow (with limit if set)
  if (riskLevel === "medium" && suggestedLimit) {
    if (sentToday >= suggestedLimit) {
      return {
        canSend: false,
        riskLevel: "medium",
        riskScore,
        suggestedDailyLimit: suggestedLimit,
        reason: `Daily send limit reached for medium-risk account. Suggested max: ${suggestedLimit} emails/day.`,
      };
    }
  }

  // LOW RISK or within limits: Allow sending
  return {
    canSend: true,
    riskLevel,
    riskScore,
    suggestedDailyLimit: suggestedLimit,
  };
}





























































