import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface SafetyCheckResult {
  can_send: boolean;
  reason?: string;
  message?: string;
  spam_risk?: "low" | "medium" | "high" | "critical";
  spam_score?: number;
}

/**
 * Block 14900 - Deliverability Shield v1 Safety Check
 * Comprehensive pre-send safety check including:
 * - Domain health score
 * - DNS verification
 * - Sending safety rules (rate limits, bounce/complaint thresholds)
 * - Content spam scanning
 * - Warmup state
 */
export async function checkDeliverabilitySafety(
  orgId: string,
  domainSettingsId: string | null,
  toEmail: string,
  subject: string,
  body: string,
  campaignId?: string
): Promise<SafetyCheckResult> {
  try {
    // If no domain_settings_id, try to find it from org
    if (!domainSettingsId) {
      const { data: domainSettings } = await supabase
        .from("domain_settings")
        .select("id")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (domainSettings) {
        domainSettingsId = domainSettings.id;
      }
    }

    // If still no domain settings, allow sending but log warning
    if (!domainSettingsId) {
      console.warn("No domain_settings found for org, skipping deliverability checks");
      return {
        can_send: true,
        message: "Domain settings not configured",
      };
    }

    // 1. Check sending safety (rate limits, bounce/complaint thresholds, domain validation)
    const { data: safetyCheck, error: safetyError } = await supabase.rpc(
      "check_sending_safety",
      {
        p_org_id: orgId,
        p_domain_settings_id: domainSettingsId,
        p_to_email: toEmail,
        p_campaign_id: campaignId || null,
      }
    );

    if (safetyError) {
      console.error("Safety check error:", safetyError);
      // Fail open on error, but log it
      return {
        can_send: true,
        message: "Safety check error, allowing send",
      };
    }

    if (!safetyCheck?.can_send) {
      return {
        can_send: false,
        reason: safetyCheck?.reason || "safety_check_failed",
        message: safetyCheck?.message || "Sending blocked by safety rules",
      };
    }

    // 2. Check warmup state if domain is warming up
    const { data: warmupState } = await supabase
      .from("domain_warmup_state")
      .select("*")
      .eq("domain_settings_id", domainSettingsId)
      .single();

    if (warmupState && warmupState.warmup_status === "warming") {
      if (warmupState.emails_sent_today >= warmupState.current_daily_limit) {
        return {
          can_send: false,
          reason: "warmup_limit_reached",
          message: `Daily warmup limit reached: ${warmupState.emails_sent_today}/${warmupState.current_daily_limit}`,
        };
      }
    }

    // 3. Scan content for spam (only if risk level is critical, block sending)
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const FUNCTION_URL = SUPABASE_URL.replace(/\.supabase\.co/, ".functions.supabase.co");

    try {
      const scanResponse = await fetch(`${FUNCTION_URL}/deliverability-scanContent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({
          org_id: orgId,
          campaign_id: campaignId || null,
          subject_line: subject,
          email_body: body,
        }),
      });

      if (scanResponse.ok) {
        const scanResult = await scanResponse.json();
        
        if (scanResult.risk_level === "critical") {
          return {
            can_send: false,
            reason: "spam_content_detected",
            message: "Email content flagged as spam. Please revise before sending.",
            spam_risk: "critical",
            spam_score: scanResult.spam_score,
          };
        }

        // Return spam risk info even if we allow sending
        return {
          can_send: true,
          spam_risk: scanResult.risk_level,
          spam_score: scanResult.spam_score,
          message: scanResult.risk_level === "high" 
            ? "High spam risk detected. Consider revising content."
            : undefined,
        };
      }
    } catch (scanError) {
      // If content scan fails, allow sending but log error
      console.error("Content scan error:", scanError);
    }

    return {
      can_send: true,
      message: "All safety checks passed",
    };
  } catch (error: any) {
    console.error("Deliverability safety check error:", error);
    // Fail open on error
    return {
      can_send: true,
      message: "Safety check error, allowing send",
    };
  }
}

/**
 * Record email send for warmup tracking
 */
export async function recordWarmupSend(domainSettingsId: string): Promise<void> {
  try {
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const FUNCTION_URL = SUPABASE_URL.replace(/\.supabase\.co/, ".functions.supabase.co");

    await fetch(`${FUNCTION_URL}/deliverability-warmup`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        domain_settings_id: domainSettingsId,
        action: "increment",
      }),
    });
  } catch (error) {
    console.error("Error recording warmup send:", error);
  }
}





















































