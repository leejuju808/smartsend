// Helper functions for sender pool management

import { supabaseAdmin } from "./supabaseAdmin";

const FN_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;

export interface PickSenderResult {
  sender_id: string;
  minuteBucket: string;
  day: string;
} | {
  blocked: true;
  reason: "quiet_hours" | "rate_limited";
};

/**
 * Pick a sender from a pool for a campaign
 * Returns sender_id and timing info, or blocked status
 */
export async function pickSenderFromPool(
  org_id: string,
  pool_id: string
): Promise<PickSenderResult> {
  try {
    const res = await fetch(`${FN_URL}/functions/v1/pickSender`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ org_id, pool_id }),
    });

    if (!res.ok) {
      throw new Error(`pickSender failed: ${res.statusText}`);
    }

    const data = await res.json();
    return data;
  } catch (error: any) {
    console.error("Error picking sender:", error);
    throw error;
  }
}

/**
 * Increment sender usage after successful send
 */
export async function incrementSenderUsage(
  senderId: string,
  day: string,
  minuteBucket: string
): Promise<void> {
  await supabaseAdmin.rpc("increment_sender_usage", {
    p_sender: senderId,
    p_day: day,
    p_minute: minuteBucket,
  });
}

/**
 * Get sender account details by ID
 */
export async function getSenderAccount(senderId: string) {
  const { data, error } = await supabaseAdmin
    .from("sender_accounts")
    .select("*")
    .eq("id", senderId)
    .single();

  if (error) throw error;
  return data;
}

/**
 * Check if we should cooldown a sender based on bounce spikes
 * Returns true if cooldown should be set
 */
export async function checkBounceSpike(senderId: string, threshold = 0.1, window = 100): Promise<boolean> {
  // This is a placeholder - implement actual bounce tracking logic
  // For now, return false (no cooldown)
  // TODO: Query recent sends for this sender, count bounces, calculate bounce rate
  return false;
}

/**
 * Set cooldown on a sender account
 */
export async function setSenderCooldown(senderId: string, hours = 12): Promise<void> {
  const cooldownUntil = new Date();
  cooldownUntil.setHours(cooldownUntil.getHours() + hours);

  await supabaseAdmin
    .from("sender_accounts")
    .update({ cooldown_until: cooldownUntil.toISOString() })
    .eq("id", senderId);
}

/**
 * Log campaign action (e.g., sender_cooldown)
 */
export async function logCampaignAction(
  org_id: string,
  campaign_id: string | null,
  action: string,
  meta?: Record<string, any>
): Promise<void> {
  // Check if campaign_logs table exists and has the right structure
  try {
    await supabaseAdmin.from("campaign_logs").insert({
      org_id,
      campaign_id,
      action,
      meta: meta || {},
      created_at: new Date().toISOString(),
    });
  } catch (error) {
    // Table might not exist or have different structure - log to console
    console.warn("Failed to log campaign action:", action, meta);
  }
}

