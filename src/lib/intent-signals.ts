// Block 177: Intent Signals Utility
// Helper functions for generating intent signals

import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

export type IntentSignalType =
  | "reply"
  | "multi_open"
  | "multi_click"
  | "tech_stack_match"
  | "inbound_reply"
  | "burst_activity"
  | "new_lead_same_company"
  | "campaign_overlap";

/**
 * Insert an intent signal for a company
 */
export async function insertIntentSignal({
  accountId,
  companyId,
  leadId,
  signalType,
  weight = 1,
}: {
  accountId: string; // org_id or workspace_id
  companyId: string | null;
  leadId?: string | null;
  signalType: IntentSignalType;
  weight?: number;
}): Promise<void> {
  if (!companyId) {
    return; // Skip if no company_id
  }

  try {
    await supabaseAdmin.from("intent_signals").insert({
      account_id: accountId,
      company_id: companyId,
      lead_id: leadId || null,
      signal_type: signalType,
      weight,
    });
  } catch (error) {
    console.error("Failed to insert intent signal:", error);
    // Don't throw - intent signals are non-critical
  }
}

/**
 * Get company_id from lead_id
 */
export async function getCompanyIdFromLead(
  leadId: string
): Promise<string | null> {
  try {
    const { data: lead } = await supabaseAdmin
      .from("leads")
      .select("company_id")
      .eq("id", leadId)
      .single();

    return lead?.company_id || null;
  } catch (error) {
    console.error("Failed to get company_id from lead:", error);
    return null;
  }
}

/**
 * Get company_id from lead email and org_id
 */
export async function getCompanyIdFromEmail(
  email: string,
  orgId: string
): Promise<string | null> {
  try {
    // Extract domain from email
    const domain = email.split("@")[1]?.toLowerCase();
    if (!domain) return null;

    // Find company by domain and org_id
    const { data: company } = await supabaseAdmin
      .from("companies")
      .select("id")
      .eq("domain", domain)
      .eq("org_id", orgId)
      .single();

    return company?.id || null;
  } catch (error) {
    console.error("Failed to get company_id from email:", error);
    return null;
  }
}

/**
 * Check if lead has multiple opens (>= 3) and generate signal
 */
export async function checkMultiOpenSignal(
  leadId: string,
  accountId: string
): Promise<void> {
  try {
    // Check if signal already exists for this lead (avoid duplicates)
    const { data: existing } = await supabaseAdmin
      .from("intent_signals")
      .select("id")
      .eq("lead_id", leadId)
      .eq("signal_type", "multi_open")
      .limit(1);

    if (existing && existing.length > 0) {
      return; // Already generated
    }

    const { data: events } = await supabaseAdmin
      .from("email_events")
      .select("id")
      .eq("lead_id", leadId)
      .eq("event", "open");

    const openCount = events?.length || 0;

    if (openCount >= 3) {
      const companyId = await getCompanyIdFromLead(leadId);
      if (companyId) {
        await insertIntentSignal({
          accountId,
          companyId,
          leadId,
          signalType: "multi_open",
          weight: 2,
        });
      }
    }
  } catch (error) {
    console.error("Failed to check multi-open signal:", error);
  }
}

/**
 * Check if lead has multiple clicks (>= 2) and generate signal
 */
export async function checkMultiClickSignal(
  leadId: string,
  accountId: string
): Promise<void> {
  try {
    // Check if signal already exists for this lead (avoid duplicates)
    const { data: existing } = await supabaseAdmin
      .from("intent_signals")
      .select("id")
      .eq("lead_id", leadId)
      .eq("signal_type", "multi_click")
      .limit(1);

    if (existing && existing.length > 0) {
      return; // Already generated
    }

    const { data: events } = await supabaseAdmin
      .from("email_events")
      .select("id")
      .eq("lead_id", leadId)
      .eq("event", "click");

    const clickCount = events?.length || 0;

    if (clickCount >= 2) {
      const companyId = await getCompanyIdFromLead(leadId);
      if (companyId) {
        await insertIntentSignal({
          accountId,
          companyId,
          leadId,
          signalType: "multi_click",
          weight: 3,
        });
      }
    }
  } catch (error) {
    console.error("Failed to check multi-click signal:", error);
  }
}

