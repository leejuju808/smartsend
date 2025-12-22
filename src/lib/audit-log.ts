/**
 * Block 21947 — SmartSend Lead Audit Log Helper
 * 
 * Utility functions for logging audit events to the immutable audit log.
 * Use this throughout SmartSend modules to log every meaningful action.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

export type ActorType = "system" | "user" | "homeowner";

export interface LogAuditEventParams {
  lead_id: string;
  event_type: string;
  actor_type: ActorType;
  actor_id?: string | null;
  event_data?: Record<string, any>;
}

/**
 * Log an audit event to the immutable audit log.
 * 
 * This function calls the Supabase edge function to log events.
 * It's safe to call from both client and server-side code.
 * 
 * @example
 * ```ts
 * await logAuditEvent({
 *   lead_id: lead.id,
 *   event_type: "automation_follow_up_sent",
 *   actor_type: "system",
 *   event_data: { template_key: "followup_48h", scheduled_at: "2025-01-30T10:00:00Z" }
 * });
 * ```
 * 
 * @example
 * ```ts
 * await logAuditEvent({
 *   lead_id: lead.id,
 *   event_type: "user_status_change",
 *   actor_type: "user",
 *   actor_id: userId,
 *   event_data: { old_status: "new", new_status: "in_progress" }
 * });
 * ```
 */
export async function logAuditEvent(params: LogAuditEventParams): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.warn("Supabase URL or key not configured. Skipping audit log.");
    return;
  }

  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/log-audit-event`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        lead_id: params.lead_id,
        event_type: params.event_type,
        actor_type: params.actor_type,
        actor_id: params.actor_id || null,
        event_data: params.event_data || {},
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "Unknown error" }));
      console.error("Failed to log audit event:", error);
      // Don't throw - audit logging should never break the main flow
    }
  } catch (error) {
    console.error("Error logging audit event:", error);
    // Don't throw - audit logging should never break the main flow
  }
}

/**
 * Convenience function to log automation events
 */
export async function logAutomationEvent(
  leadId: string,
  eventType: string,
  eventData?: Record<string, any>
): Promise<void> {
  return logAuditEvent({
    lead_id: leadId,
    event_type: eventType,
    actor_type: "system",
    event_data: eventData,
  });
}

/**
 * Convenience function to log user actions
 */
export async function logUserEvent(
  leadId: string,
  eventType: string,
  userId: string,
  eventData?: Record<string, any>
): Promise<void> {
  return logAuditEvent({
    lead_id: leadId,
    event_type: eventType,
    actor_type: "user",
    actor_id: userId,
    event_data: eventData,
  });
}

/**
 * Convenience function to log homeowner actions
 */
export async function logHomeownerEvent(
  leadId: string,
  eventType: string,
  eventData?: Record<string, any>
): Promise<void> {
  return logAuditEvent({
    lead_id: leadId,
    event_type: eventType,
    actor_type: "homeowner",
    event_data: eventData,
  });
}









































