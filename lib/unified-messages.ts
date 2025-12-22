/**
 * Block 150000 — Unified Messaging Inbox
 * Helper functions for inserting messages into the unified messages table
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
});

export interface UnifiedMessageInput {
  company_id: string;
  lead_id?: string | null;
  channel: "email" | "sms" | "widget" | "call" | "system";
  direction: "incoming" | "outgoing";
  sender?: string | null;
  sender_email?: string | null;
  sender_phone?: string | null;
  body: string;
  subject?: string | null;
  body_html?: string | null;
  metadata?: Record<string, any>;
  external_id?: string | null;
  external_thread_id?: string | null;
}

/**
 * Insert a message into the unified messages table
 * This is the single source of truth for all communication channels
 */
export async function insertUnifiedMessage(
  input: UnifiedMessageInput
): Promise<{ success: boolean; message_id?: string; error?: string }> {
  try {
    const { data, error } = await supabase
      .from("messages")
      .insert({
        company_id: input.company_id,
        lead_id: input.lead_id || null,
        channel: input.channel,
        direction: input.direction,
        sender: input.sender || null,
        sender_email: input.sender_email || null,
        sender_phone: input.sender_phone || null,
        body: input.body,
        subject: input.subject || null,
        body_html: input.body_html || null,
        metadata: input.metadata || {},
        external_id: input.external_id || null,
        external_thread_id: input.external_thread_id || null,
      })
      .select("id")
      .single();

    if (error) {
      console.error("Error inserting unified message:", error);
      return { success: false, error: error.message };
    }

    return { success: true, message_id: data.id };
  } catch (error: any) {
    console.error("Exception inserting unified message:", error);
    return { success: false, error: error.message || "Unknown error" };
  }
}

/**
 * Get company_id from lead_id
 */
export async function getCompanyIdFromLead(
  lead_id: string
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("leads")
      .select("roofing_company_id")
      .eq("id", lead_id)
      .single();

    if (error || !data) {
      console.error("Error getting company_id from lead:", error);
      return null;
    }

    return data.roofing_company_id || null;
  } catch (error) {
    console.error("Exception getting company_id from lead:", error);
    return null;
  }
}

/**
 * Get company_id from workspace_id (fallback)
 */
export async function getCompanyIdFromWorkspace(
  workspace_id: string
): Promise<string | null> {
  try {
    // Try to find a roofing company for this workspace
    const { data, error } = await supabase
      .from("roofing_companies")
      .select("id")
      .eq("workspace_id", workspace_id)
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    return data.id;
  } catch (error) {
    console.error("Exception getting company_id from workspace:", error);
    return null;
  }
}


























