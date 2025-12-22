/**
 * SmartSend Real-Time Alerts Helper Library
 * Use this to trigger alerts from anywhere in the codebase
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
});

export type AlertType =
  | "hot_lead"
  | "insurance_claim"
  | "storm_damage"
  | "appointment"
  | "system_billing"
  | "performance_insights";

export interface CreateAlertParams {
  workspace_id: string;
  user_id?: string; // null = workspace-wide alert
  type: AlertType;
  title: string;
  message: string;
  contact_id?: string;
  campaign_id?: string;
  appointment_id?: string;
  metadata?: Record<string, any>;
  source?: string;
}

async function getOwnerAwayState(workspace_id: string): Promise<{ enabled: boolean; session_id: string | null }> {
  try {
    const { data } = await supabase
      .from("owner_settings")
      .select("setting_value")
      .eq("workspace_id", workspace_id)
      .eq("setting_key", "owner_away")
      .maybeSingle();
    const v = (data as any)?.setting_value;
    return {
      enabled: Boolean(v?.enabled),
      session_id: typeof v?.session_id === "string" ? v.session_id : null,
    };
  } catch {
    return { enabled: false, session_id: null };
  }
}

function isUrgentText(t: string) {
  return /(urgent|asap|emergency|right away|immediately|today|tomorrow|leak|leaking|water damage|active leak)/i.test(t || "");
}

/**
 * Create an alert using the database function
 */
export async function createAlert(params: CreateAlertParams): Promise<string | null> {
  try {
    const { data: alertId, error } = await supabase.rpc("create_alert", {
      p_workspace_id: params.workspace_id,
      p_user_id: params.user_id || null,
      p_type: params.type,
      p_title: params.title,
      p_message: params.message,
      p_contact_id: params.contact_id || null,
      p_campaign_id: params.campaign_id || null,
      p_appointment_id: params.appointment_id || null,
      p_metadata: params.metadata || {},
      p_source: params.source || "system",
    });

    if (error) {
      console.error("Error creating alert:", error);
      return null;
    }

    return alertId;
  } catch (error) {
    console.error("Error in createAlert:", error);
    return null;
  }
}

/**
 * Trigger alert for new reply with hot lead detection
 */
export async function alertNewReply(params: {
  workspace_id: string;
  contact_id: string;
  message_id: string;
  reply_text: string;
  intent?: string;
  campaign_id?: string;
}) {
  const ownerAway = await getOwnerAwayState(params.workspace_id);

  const hotKeywords = [
    "yes",
    "interested",
    "come by",
    "schedule",
    "inspection",
    "quote",
    "estimate",
    "when can you",
  ];
  const replyLower = params.reply_text.toLowerCase();
  const isHotLead = hotKeywords.some((keyword) => replyLower.includes(keyword));

  // Block 271200 — Owner Away mode: only escalate urgent hot leads.
  if (ownerAway.enabled) {
    const hot = params.intent === "hot_lead" || isHotLead;
    const urgent = isUrgentText(params.reply_text);
    if (!(hot && urgent)) {
      return;
    }
  }

  // Call edge function for processing
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/alerts/newReply`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${supabaseServiceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        workspace_id: params.workspace_id,
        contact_id: params.contact_id,
        message_id: params.message_id,
        reply_text: params.reply_text,
        intent: params.intent || (isHotLead ? "hot_lead" : undefined),
        campaign_id: params.campaign_id,
        owner_away: ownerAway.enabled,
        owner_away_session_id: ownerAway.session_id,
      }),
    });

    if (!response.ok) {
      console.error("Failed to trigger reply alert");
    }
  } catch (error) {
    console.error("Error triggering reply alert:", error);
  }
}

/**
 * Trigger alert for storm damage detection
 */
export async function alertStormDamage(params: {
  workspace_id: string;
  contact_id?: string;
  message_id?: string;
  storm_type: string;
  location?: string;
  severity?: "low" | "medium" | "high";
  metadata?: Record<string, any>;
}) {
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/alerts/stormDetect`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${supabaseServiceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        workspace_id: params.workspace_id,
        contact_id: params.contact_id,
        message_id: params.message_id,
        storm_type: params.storm_type,
        location: params.location,
        severity: params.severity || "medium",
        metadata: params.metadata,
      }),
    });

    if (!response.ok) {
      console.error("Failed to trigger storm alert");
    }
  } catch (error) {
    console.error("Error triggering storm alert:", error);
  }
}

/**
 * Trigger alert for insurance claim detection
 */
export async function alertInsuranceClaim(params: {
  workspace_id: string;
  contact_id: string;
  message_id?: string;
  insurance_type?: string;
  details?: string;
  metadata?: Record<string, any>;
}) {
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/alerts/insuranceDetect`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${supabaseServiceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        workspace_id: params.workspace_id,
        contact_id: params.contact_id,
        message_id: params.message_id,
        insurance_type: params.insurance_type || "claim",
        details: params.details,
        metadata: params.metadata,
      }),
    });

    if (!response.ok) {
      console.error("Failed to trigger insurance alert");
    }
  } catch (error) {
    console.error("Error triggering insurance alert:", error);
  }
}

/**
 * Trigger alert for appointment events
 */
export async function alertAppointment(params: {
  workspace_id: string;
  appointment_id: string;
  event_type: "booked" | "canceled" | "rescheduled" | "reminder" | "no_show";
  contact_id?: string;
  appointment_time?: string;
  homeowner_name?: string;
}) {
  // Block 271200 — Owner Away mode: suppress non-urgent notifications.
  const ownerAway = await getOwnerAwayState(params.workspace_id);
  if (ownerAway.enabled) return null;

  const eventMessages = {
    booked: "New Appointment Booked",
    canceled: "Appointment Canceled",
    rescheduled: "Appointment Rescheduled",
    reminder: "Appointment Reminder",
    no_show: "No-Show Detected",
  };

  const title = `📅 ${eventMessages[params.event_type]}`;
  const message = params.homeowner_name
    ? `${params.homeowner_name} — ${params.appointment_time || "Check details"}`
    : `Appointment ${params.event_type}`;

  return createAlert({
    workspace_id: params.workspace_id,
    type: "appointment",
    title,
    message,
    appointment_id: params.appointment_id,
    contact_id: params.contact_id,
    metadata: {
      event_type: params.event_type,
      appointment_time: params.appointment_time,
    },
    source: "appointment_system",
  });
}

/**
 * Trigger alert for billing/system issues
 */
export async function alertBillingIssue(params: {
  workspace_id: string;
  issue_type: "payment_failed" | "trial_ending" | "over_limit" | "campaign_paused" | "domain_health_low";
  details?: string;
  metadata?: Record<string, any>;
}) {
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/alerts/billingIssues`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${supabaseServiceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        workspace_id: params.workspace_id,
        issue_type: params.issue_type,
        details: params.details,
        metadata: params.metadata,
      }),
    });

    if (!response.ok) {
      console.error("Failed to trigger billing alert");
    }
  } catch (error) {
    console.error("Error triggering billing alert:", error);
  }
}

/**
 * Trigger alert for performance insights
 */
export async function alertPerformance(params: {
  workspace_id: string;
  metric_type: "high_opens" | "high_replies" | "high_value_lead" | "insurance_revenue" | "storm_wave";
  value: number;
  details?: string;
  campaign_id?: string;
  metadata?: Record<string, any>;
}) {
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/alerts/performance`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${supabaseServiceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        workspace_id: params.workspace_id,
        metric_type: params.metric_type,
        value: params.value,
        details: params.details,
        campaign_id: params.campaign_id,
        metadata: params.metadata,
      }),
    });

    if (!response.ok) {
      console.error("Failed to trigger performance alert");
    }
  } catch (error) {
    console.error("Error triggering performance alert:", error);
  }
}
