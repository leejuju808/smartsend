/**
 * SmartSend State & Region Law Engine
 * 
 * Provides easy access to state-specific laws and compliance checking
 * for messaging, insurance suggestions, and summaries.
 */

import { createClient } from "@/lib/supabase/client";

export interface StateLaws {
  state_code: string;
  state_name?: string;
  rules?: {
    licensing?: {
      requires_license: boolean;
      license_type: string | null;
      commercial_separate: boolean;
      license_details: string | null;
    };
    insurance?: {
      can_negotiate_claim: boolean;
      can_document_damage: boolean;
      can_interpret_policy: boolean;
      can_show_damage: boolean;
    };
    storm?: {
      claim_filing_deadline_days: number | null;
      door_to_door_allowed: boolean;
      same_day_solicitation: boolean;
      cooling_off_period_hours: number | null;
      public_adjuster_required: boolean;
    };
  };
  deductible?: {
    waiving_illegal: boolean;
    assistance_allowed: boolean;
    payment_rules: string | null;
    financing_allowed: boolean;
    payment_plans_allowed: boolean;
  };
  matching?: {
    requirement_type: string | null;
    affects_replacement_value: boolean;
    affects_supplement_potential: boolean;
    details: string | null;
  };
  code_requirements?: {
    ventilation_required: boolean;
    decking_required: boolean;
    ice_water_shield_required: boolean;
    ice_water_shield_valleys: boolean;
    flashing_required: boolean;
    underlayment_required: boolean;
    code_upgrades_payable: boolean;
  };
  restrictions?: {
    prohibited_practices?: {
      policy_interpretation: boolean;
      negotiation_language: boolean;
      deductible_waiving: boolean;
      free_roof_promises: boolean;
      false_storm_claims: boolean;
      misleading_guarantees: boolean;
    };
    prohibited_phrases?: string[];
    prohibited_keywords?: string[];
    compliant_alternatives?: Record<string, string>;
  };
}

export interface ComplianceCheck {
  is_compliant: boolean;
  violations: string[];
  suggested_replacement: string;
}

export interface AdjustedInsuranceSuggestions {
  original_suggestions: any[];
  adjusted_suggestions: any[];
  filtered_suggestions: string[];
  adjustments_applied: string[];
  matching_law_impact: string | null;
  code_requirements_applied: boolean;
}

export interface EnhancedSummary {
  summary: string;
  original_summary: string;
  state_rule_reminder: string | null;
  reminders_count: number;
}

/**
 * Get all state laws for a given state
 */
export async function getStateLaws(stateCode: string): Promise<StateLaws | null> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("get_state_laws", {
      p_state_code: stateCode.toUpperCase(),
    });

    if (error) {
      console.error("[State Law Engine] Error fetching laws:", error);
      return null;
    }

    return data as StateLaws;
  } catch (error) {
    console.error("[State Law Engine] Unexpected error:", error);
    return null;
  }
}

/**
 * Check if a message is compliant with state laws
 */
export async function checkMessageCompliance(
  stateCode: string,
  message: string
): Promise<ComplianceCheck | null> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("check_messaging_compliance", {
      p_state_code: stateCode.toUpperCase(),
      p_message_text: message,
    });

    if (error) {
      console.error("[State Law Engine] Error checking compliance:", error);
      return null;
    }

    return data as ComplianceCheck;
  } catch (error) {
    console.error("[State Law Engine] Unexpected error:", error);
    return null;
  }
}

/**
 * Adjust messaging based on state laws (via edge function)
 */
export async function adjustMessaging(
  message: string,
  stateCode: string,
  workspaceId?: string
): Promise<{
  success: boolean;
  original_message: string;
  adjusted_message: string;
  is_compliant: boolean;
  violations: string[];
  replacements: Array<{ original: string; replacement: string }>;
} | null> {
  try {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/laws-adjust-messaging`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          message,
          state_code: stateCode,
          workspace_id: workspaceId,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("[State Law Engine] Error adjusting messaging:", error);
    return null;
  }
}

/**
 * Apply state laws to insurance suggestions (via edge function)
 */
export async function applyLawsToInsurance(
  stateCode: string,
  insuranceSuggestions: any[],
  contactId?: string,
  workspaceId?: string
): Promise<AdjustedInsuranceSuggestions | null> {
  try {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/laws-apply-to-insurance`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          state_code: stateCode,
          insurance_suggestions: insuranceSuggestions,
          contact_id: contactId,
          workspace_id: workspaceId,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("[State Law Engine] Error applying laws to insurance:", error);
    return null;
  }
}

/**
 * Apply state laws to summary (via edge function)
 */
export async function applyLawsToSummary(
  stateCode: string,
  summaryText: string,
  contactId?: string,
  workspaceId?: string
): Promise<EnhancedSummary | null> {
  try {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/laws-apply-to-summary`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          state_code: stateCode,
          summary_text: summaryText,
          contact_id: contactId,
          workspace_id: workspaceId,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("[State Law Engine] Error applying laws to summary:", error);
    return null;
  }
}

/**
 * Get state code from contact
 */
export function getStateFromContact(contact: {
  state?: string | null;
  city?: string | null;
  postal_code?: string | null;
}): string | null {
  if (contact.state) {
    return contact.state.toUpperCase().substring(0, 2);
  }
  return null;
}

/**
 * Quick check: Can contractor negotiate claims in this state?
 */
export async function canNegotiateClaims(stateCode: string): Promise<boolean> {
  const laws = await getStateLaws(stateCode);
  return laws?.rules?.insurance?.can_negotiate_claim ?? false;
}

/**
 * Quick check: Is deductible waiving illegal in this state?
 */
export async function isDeductibleWaivingIllegal(stateCode: string): Promise<boolean> {
  const laws = await getStateLaws(stateCode);
  return laws?.deductible?.waiving_illegal ?? false;
}

/**
 * Quick check: Does state require roofing license?
 */
export async function requiresRoofingLicense(stateCode: string): Promise<boolean> {
  const laws = await getStateLaws(stateCode);
  return laws?.rules?.licensing?.requires_license ?? false;
}





















































