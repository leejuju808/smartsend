// Block 20340 — Unified Activity Logger
// Centralized helper for logging all activity types to inbox_activity_log

import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type LogEventType =
  | "email"
  | "reply"
  | "call"
  | "appointment"
  | "tag"
  | "stage_change"
  | "profile_update"
  | "enrichment"
  | "insurance_update"
  | "next_action"
  | "note"
  | "status_change"
  | "value_change"
  | "follow_up"
  | "system";

export interface LogEvent {
  conversation_id: string; // Maps to thread_id in DB
  account_id?: string; // Optional, will fetch campaign_id from thread if not provided
  user_id?: string | null;
  type: LogEventType;
  title?: string;
  body?: string | null;
  meta?: Record<string, any>;
  
  // Email-specific fields
  email_subject?: string;
  email_direction?: "outbound" | "inbound";
  email_status?: "sent" | "delivered" | "opened" | "clicked" | "bounced";
  
  // Call-specific fields
  call_duration_seconds?: number;
  call_outcome?: string;
  
  // Appointment-specific fields
  appointment_type?: string;
  appointment_at?: string | Date;
  appointment_status?: string;
  
  // Change tracking fields
  property_change?: Record<string, any>;
  roof_change?: Record<string, any>;
  insurance_change?: Record<string, any>;
  tag_change?: Record<string, any>;
  
  // Enrichment fields
  enrichment_provider?: string;
  enrichment_status?: string;
  
  // Stage change fields
  stage_from?: string;
  stage_to?: string;
  
  // Next action recommendation
  next_action_recommendation?: Record<string, any>;
}

/**
 * Logs an activity event to inbox_activity_log
 * Automatically resolves campaign_id from thread_id if not provided
 */
export async function logActivity(event: LogEvent): Promise<void> {
  try {
    const { conversation_id, account_id, user_id, type, title, body, meta = {} } = event;
    
    // Resolve campaign_id from thread if not provided
    let campaign_id = account_id;
    if (!campaign_id) {
      const { data: thread } = await supabaseAdmin
        .from("inbox_threads")
        .select("campaign_id")
        .eq("id", conversation_id)
        .single();
      
      if (!thread?.campaign_id) {
        console.error("Could not resolve campaign_id for thread:", conversation_id);
        return;
      }
      campaign_id = thread.campaign_id;
    }
    
    // Build the payload with all fields
    const payload: any = {
      thread_id: conversation_id,
      campaign_id,
      user_id: user_id ?? null,
      type,
      title,
      body,
    };
    
    // Add email fields if present
    if (event.email_subject) payload.email_subject = event.email_subject;
    if (event.email_direction) payload.email_direction = event.email_direction;
    if (event.email_status) payload.email_status = event.email_status;
    
    // Add call fields if present
    if (event.call_duration_seconds !== undefined) payload.call_duration_seconds = event.call_duration_seconds;
    if (event.call_outcome) payload.call_outcome = event.call_outcome;
    
    // Add appointment fields if present
    if (event.appointment_type) payload.appointment_type = event.appointment_type;
    if (event.appointment_at) {
      payload.appointment_at = typeof event.appointment_at === "string" 
        ? event.appointment_at 
        : event.appointment_at.toISOString();
    }
    if (event.appointment_status) payload.appointment_status = event.appointment_status;
    
    // Add change tracking fields if present
    if (event.property_change) payload.property_change = event.property_change;
    if (event.roof_change) payload.roof_change = event.roof_change;
    if (event.insurance_change) payload.insurance_change = event.insurance_change;
    if (event.tag_change) payload.tag_change = event.tag_change;
    
    // Add enrichment fields if present
    if (event.enrichment_provider) payload.enrichment_provider = event.enrichment_provider;
    if (event.enrichment_status) payload.enrichment_status = event.enrichment_status;
    
    // Add stage change fields if present
    if (event.stage_from) payload.stage_from = event.stage_from;
    if (event.stage_to) payload.stage_to = event.stage_to;
    
    // Add next action recommendation if present
    if (event.next_action_recommendation) {
      payload.next_action_recommendation = event.next_action_recommendation;
    }
    
    // Merge any additional meta fields
    Object.assign(payload, meta);
    
    const { error } = await supabaseAdmin
      .from("inbox_activity_log")
      .insert(payload);
    
    if (error) {
      console.error("Activity log insert error", error);
      throw error;
    }
  } catch (error) {
    console.error("Failed to log activity:", error);
    // Don't throw - logging failures shouldn't break the app
  }
}

















































