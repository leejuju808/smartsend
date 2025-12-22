/**
 * Block 12100 — Multi-Email Rotation Engine v1
 * Identity rotation helper functions
 */

import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Selects the next identity for rotation using round-robin
 * Returns null if no healthy identities are available
 */
export async function selectNextIdentity(
  supabase: SupabaseClient,
  orgId: string
): Promise<string | null> {
  const { data: identityId, error } = await supabase.rpc("select_next_identity", {
    p_org_id: orgId,
  });

  if (error) {
    console.error("Error selecting next identity:", error);
    return null;
  }

  return identityId || null;
}

/**
 * Gets all healthy identities for an org
 */
export async function getHealthyIdentities(
  supabase: SupabaseClient,
  orgId: string
): Promise<Array<{
  id: string;
  identity_name: string | null;
  email_address: string;
  daily_send_limit: number;
  hourly_send_limit: number;
  sent_today: number;
  sent_this_hour: number;
  daily_remaining: number;
  hourly_remaining: number;
  last_risk_score: number | null;
  disabled: boolean;
  disable_reason: string | null;
}>> {
  const { data, error } = await supabase.rpc("get_healthy_identities", {
    p_org_id: orgId,
  });

  if (error) {
    console.error("Error getting healthy identities:", error);
    return [];
  }

  return data || [];
}

/**
 * Records a send event for usage tracking
 */
export async function recordIdentitySend(
  supabase: SupabaseClient,
  orgId: string,
  identityId: string,
  count: number = 1
): Promise<void> {
  const { error } = await supabase.rpc("record_identity_send", {
    p_org_id: orgId,
    p_identity_id: identityId,
    p_count: count,
  });

  if (error) {
    console.error("Error recording identity send:", error);
    // Don't throw - usage tracking failure shouldn't block sending
  }
}

/**
 * Checks if an identity is healthy
 */
export async function checkIdentityHealth(
  supabase: SupabaseClient,
  identityId: string
): Promise<{
  healthy: boolean;
  identity_id: string;
  email_address: string;
  warmup_score: number | null;
  disabled: boolean;
  disable_reason: string | null;
  bounce_rate: number | null;
  reasons: string[];
}> {
  const { data, error } = await supabase.rpc("check_identity_health", {
    p_identity_id: identityId,
  });

  if (error) {
    console.error("Error checking identity health:", error);
    return {
      healthy: false,
      identity_id: identityId,
      email_address: "",
      warmup_score: null,
      disabled: true,
      disable_reason: "Health check failed",
      bounce_rate: null,
      reasons: [error.message],
    };
  }

  return data || {
    healthy: false,
    identity_id: identityId,
    email_address: "",
    warmup_score: null,
    disabled: true,
    disable_reason: "Unknown",
    bounce_rate: null,
    reasons: [],
  };
}




























































