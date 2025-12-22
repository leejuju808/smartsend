/**
 * State Law Helpers
 * 
 * Helper functions to integrate legal awareness into SmartSend workflows.
 * These functions detect state from contacts/leads and apply legal filters automatically.
 */

import { createClient } from "@/lib/supabase/server";

export interface StateLawComplianceResult {
  is_compliant: boolean;
  adjusted_message?: string;
  violations?: string[];
  replacements?: Array<{ original: string; replacement: string }>;
}

export interface StateLawInfo {
  state_code: string;
  state_name: string;
  rules: {
    licensing: {
      requires_license: boolean;
      license_type: string | null;
    };
    insurance: {
      can_negotiate_claim: boolean;
      can_document_damage: boolean;
      can_interpret_policy: boolean;
      can_show_damage: boolean;
    };
    storm: {
      claim_filing_deadline_days: number | null;
      door_to_door_allowed: boolean;
      same_day_solicitation: boolean;
    };
  };
  deductible: {
    waiving_illegal: boolean;
    assistance_allowed: boolean;
    financing_allowed: boolean;
    payment_plans_allowed: boolean;
  };
  matching: {
    requirement_type: string | null;
    affects_replacement_value: boolean;
    affects_supplement_potential: boolean;
  };
  code_requirements: Record<string, any>;
  restrictions: {
    prohibited_practices: Record<string, boolean>;
    prohibited_phrases: string[];
    prohibited_keywords: string[];
    compliant_alternatives: Record<string, string>;
  };
}

/**
 * Get state code from a contact or lead
 */
export async function getStateFromContact(
  contactId?: string,
  leadId?: string
): Promise<string | null> {
  const supabase = await createClient();

  if (contactId) {
    const { data: contact } = await supabase
      .from("contacts")
      .select("state")
      .eq("id", contactId)
      .single();

    if (contact?.state) {
      return normalizeStateCode(contact.state);
    }
  }

  if (leadId) {
    const { data: lead } = await supabase
      .from("leads")
      .select("state, meta")
      .eq("id", leadId)
      .single();

    if (lead?.state) {
      return normalizeStateCode(lead.state);
    }

    // Check meta field for state
    if (lead?.meta && typeof lead.meta === "object" && "state" in lead.meta) {
      return normalizeStateCode(lead.meta.state as string);
    }
  }

  return null;
}

/**
 * Normalize state code to 2-letter uppercase format
 */
function normalizeStateCode(state: string | null | undefined): string | null {
  if (!state) return null;
  
  const normalized = state.trim().toUpperCase();
  
  // Handle full state names (basic mapping)
  const stateNameMap: Record<string, string> = {
    "WASHINGTON": "WA",
    "TEXAS": "TX",
    "FLORIDA": "FL",
    "CALIFORNIA": "CA",
    "COLORADO": "CO",
    // Add more as needed
  };

  if (stateNameMap[normalized]) {
    return stateNameMap[normalized];
  }

  // If already 2 letters, return as-is
  if (normalized.length === 2) {
    return normalized;
  }

  return null;
}

/**
 * Get state laws for a given state code
 */
export async function getStateLaws(
  stateCode: string
): Promise<StateLawInfo | null> {
  const supabase = await createClient();

  const normalized = normalizeStateCode(stateCode);
  if (!normalized) return null;

  const { data, error } = await supabase.rpc("get_state_laws", {
    p_state_code: normalized,
  });

  if (error || !data || Object.keys(data).length === 0) {
    return null;
  }

  return data as StateLawInfo;
}

/**
 * Check if messaging is compliant with state laws
 */
export async function checkMessagingCompliance(
  message: string,
  stateCode: string
): Promise<StateLawComplianceResult> {
  try {
    const response = await fetch("/api/laws/adjustMessaging", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        state_code: stateCode,
      }),
    });

    if (!response.ok) {
      return {
        is_compliant: true, // Default to compliant if check fails
        adjusted_message: message,
      };
    }

    const data = await response.json();
    return {
      is_compliant: data.is_compliant ?? true,
      adjusted_message: data.adjusted_message || message,
      violations: data.violations || [],
      replacements: data.replacements || [],
    };
  } catch (error) {
    console.error("[State Law Helpers] Error checking compliance:", error);
    return {
      is_compliant: true, // Default to compliant on error
      adjusted_message: message,
    };
  }
}

/**
 * Apply state laws to insurance suggestions
 */
export async function applyLawsToInsurance(
  suggestions: any[],
  stateCode: string,
  contactId?: string,
  workspaceId?: string
): Promise<{
  adjusted_suggestions: any[];
  filtered_suggestions: string[];
  adjustments_applied: string[];
}> {
  try {
    const response = await fetch("/api/laws/applyToInsurance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        state_code: stateCode,
        insurance_suggestions: suggestions,
        contact_id: contactId,
        workspace_id: workspaceId,
      }),
    });

    if (!response.ok) {
      return {
        adjusted_suggestions: suggestions,
        filtered_suggestions: [],
        adjustments_applied: [],
      };
    }

    const data = await response.json();
    return {
      adjusted_suggestions: data.adjusted_suggestions || suggestions,
      filtered_suggestions: data.filtered_suggestions || [],
      adjustments_applied: data.adjustments_applied || [],
    };
  } catch (error) {
    console.error("[State Law Helpers] Error applying to insurance:", error);
    return {
      adjusted_suggestions: suggestions,
      filtered_suggestions: [],
      adjustments_applied: [],
    };
  }
}

/**
 * Apply state laws to summary (add reminders)
 */
export async function applyLawsToSummary(
  summary: string,
  stateCode: string,
  contactId?: string,
  workspaceId?: string
): Promise<{
  summary: string;
  state_rule_reminder: string | null;
}> {
  try {
    const response = await fetch("/api/laws/applyToSummary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        state_code: stateCode,
        summary_text: summary,
        contact_id: contactId,
        workspace_id: workspaceId,
      }),
    });

    if (!response.ok) {
      return {
        summary,
        state_rule_reminder: null,
      };
    }

    const data = await response.json();
    return {
      summary: data.summary || summary,
      state_rule_reminder: data.state_rule_reminder || null,
    };
  } catch (error) {
    console.error("[State Law Helpers] Error applying to summary:", error);
    return {
      summary,
      state_rule_reminder: null,
    };
  }
}

/**
 * Auto-apply legal filters to rewritten content
 * This should be called after any AI rewrite operation
 */
export async function autoApplyLegalFilters(
  content: { subject?: string; body?: string },
  stateCode?: string | null,
  contactId?: string,
  leadId?: string
): Promise<{ subject?: string; body?: string }> {
  // If no state code provided, try to get it from contact/lead
  if (!stateCode) {
    stateCode = await getStateFromContact(contactId, leadId);
  }

  if (!stateCode) {
    // No state code available, return content as-is
    return content;
  }

  const result: { subject?: string; body?: string } = {};

  // Check subject compliance
  if (content.subject) {
    const subjectCheck = await checkMessagingCompliance(content.subject, stateCode);
    result.subject = subjectCheck.adjusted_message || content.subject;
  }

  // Check body compliance
  if (content.body) {
    const bodyCheck = await checkMessagingCompliance(content.body, stateCode);
    result.body = bodyCheck.adjusted_message || content.body;
  }

  return result;
}





















































