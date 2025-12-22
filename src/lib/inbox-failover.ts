// lib/inbox-failover.ts
// Failover logic for inbox rotation - Block 425
// Marks inboxes as disconnected when sending fails

import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Marks an inbox as disconnected when sending fails
 * This triggers automatic failover in rotation logic
 */
export async function markInboxDisconnected(
  supabase: SupabaseClient,
  inboxId: string,
  reason: string = "send_failed"
): Promise<void> {
  try {
    const { error } = await supabase.rpc("mark_inbox_disconnected", {
      p_inbox_id: inboxId,
      p_reason: reason,
    });

    if (error) {
      console.error(`Failed to mark inbox ${inboxId} as disconnected:`, error);
      // Fallback: direct update if RPC fails
      await supabase
        .from("sender_inboxes")
        .update({ connected: false, last_checked: new Date().toISOString() })
        .eq("id", inboxId);
    }
  } catch (err) {
    console.error(`Error marking inbox ${inboxId} as disconnected:`, err);
  }
}

/**
 * Checks if an inbox failure should trigger failover
 * Returns true if the error indicates a permanent failure (OAuth expired, SMTP rejected, etc.)
 */
export function shouldTriggerFailover(error: any): boolean {
  if (!error) return false;

  const errorMessage = String(error.message || error).toLowerCase();

  // OAuth-related errors
  if (
    errorMessage.includes("oauth") ||
    errorMessage.includes("token expired") ||
    errorMessage.includes("invalid_grant") ||
    errorMessage.includes("unauthorized")
  ) {
    return true;
  }

  // SMTP rejection errors
  if (
    errorMessage.includes("smtp") ||
    errorMessage.includes("rejected") ||
    errorMessage.includes("authentication failed") ||
    errorMessage.includes("connection refused")
  ) {
    return true;
  }

  // Rate limiting (don't failover, just back off)
  if (errorMessage.includes("rate limit") || errorMessage.includes("quota")) {
    return false;
  }

  // Other permanent failures
  if (
    errorMessage.includes("permanent") ||
    errorMessage.includes("banned") ||
    errorMessage.includes("suspended")
  ) {
    return true;
  }

  return false;
}



