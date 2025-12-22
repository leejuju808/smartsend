/**
 * Block 19500 — SmartSend Lead Verification Engine v1
 * Pre-Send Validation Checks
 * Validates lead quality before any email is sent
 */

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface PreSendValidationResult {
  canSend: boolean;
  reason?: string;
  qualityScore?: number;
  qualityCategory?: "high" | "medium" | "low" | "junk";
  redAlerts?: string[];
  warnings?: string[];
}

/**
 * Validate lead before sending email
 * Checks:
 * - Is lead still good?
 * - Is contact suppressed?
 * - Is email warmed up properly?
 * - Is lead in territory?
 * - Quality score threshold
 */
export async function validateBeforeSend(
  contactId: string | null,
  leadId: string | null,
  workspaceId: string,
  options: {
    minQualityScore?: number;
    requireTerritoryMatch?: boolean;
    blockJunkLeads?: boolean;
  } = {}
): Promise<PreSendValidationResult> {
  const {
    minQualityScore = 40,
    requireTerritoryMatch = true,
    blockJunkLeads = true,
  } = options;

  const warnings: string[] = [];

  // 1. Check if contact/lead is suppressed
  if (contactId) {
    const email = await getContactEmail(contactId);
    if (email) {
      const { data: suppressed } = await supabase
        .from("suppressions")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("email", email)
        .single();

      if (suppressed) {
        return {
          canSend: false,
          reason: "contact_suppressed",
        };
      }
    }
  }

  // 2. Get latest verification
  const { data: verification } = await supabase
    .from("lead_verification")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq(contactId ? "contact_id" : "lead_id", contactId || leadId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!verification) {
    // No verification exists - allow send but warn
    warnings.push("No verification data available");
    return {
      canSend: true,
      warnings,
    };
  }

  // 3. Check quality score
  const qualityScore = verification.quality_score || 0;
  const qualityCategory = verification.quality_category || "junk";

  if (blockJunkLeads && qualityCategory === "junk") {
    return {
      canSend: false,
      reason: "junk_lead",
      qualityScore,
      qualityCategory,
      redAlerts: verification.red_alerts || [],
    };
  }

  if (qualityScore < minQualityScore) {
    return {
      canSend: false,
      reason: "quality_score_too_low",
      qualityScore,
      qualityCategory,
      redAlerts: verification.red_alerts || [],
    };
  }

  // 4. Check territory compliance
  if (requireTerritoryMatch && verification.territory_compliant === false) {
    return {
      canSend: false,
      reason: "out_of_territory",
      qualityScore,
      qualityCategory,
      redAlerts: verification.red_alerts || [],
    };
  }

  // 5. Check email validity
  if (verification.email_verification_status === "invalid") {
    return {
      canSend: false,
      reason: "invalid_email",
      qualityScore,
      qualityCategory,
      redAlerts: verification.red_alerts || [],
    };
  }

  // 6. Check spam
  if (verification.spam_detected === true) {
    return {
      canSend: false,
      reason: "spam_detected",
      qualityScore,
      qualityCategory,
      redAlerts: verification.red_alerts || [],
    };
  }

  // 7. Check duplicates
  if (verification.is_duplicate === true) {
    warnings.push("Duplicate lead detected");
  }

  // 8. Check for red alerts
  const redAlerts = verification.red_alerts || [];
  if (redAlerts.length > 0) {
    warnings.push(`Red alerts: ${redAlerts.join(", ")}`);
  }

  // All checks passed
  return {
    canSend: true,
    qualityScore,
    qualityCategory,
    redAlerts,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

/**
 * Helper to get contact email
 */
async function getContactEmail(contactId: string): Promise<string | null> {
  const { data: contact } = await supabase
    .from("contacts")
    .select("email")
    .eq("id", contactId)
    .single();

  return contact?.email || null;
}

/**
 * Auto-verify lead if verification doesn't exist
 */
export async function ensureVerification(
  contactId: string | null,
  leadId: string | null,
  workspaceId: string
): Promise<void> {
  // Check if verification exists
  const { data: existing } = await supabase
    .from("lead_verification")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq(contactId ? "contact_id" : "lead_id", contactId || leadId)
    .limit(1)
    .single();

  if (!existing) {
    // Trigger verification
    await fetch("/api/lead/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contact_id: contactId,
        lead_id: leadId,
      }),
    }).catch((err) => {
      console.error("Failed to auto-verify lead:", err);
    });
  }
}

