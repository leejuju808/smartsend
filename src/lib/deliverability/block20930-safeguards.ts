// Block 20930 — Deliverability Engine Safeguards
// System-wide safeguards that protect domain reputation

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});

export interface DeliverabilityCheckResult {
  can_send: boolean;
  reason?: string;
  message?: string;
  domain_settings_id?: string;
}

/**
 * Block 20930 — Pre-Send Deliverability Check
 * Checks all safeguards before allowing email to be sent
 */
export async function checkDeliverabilitySafeguards(
  organizationId: string,
  fromEmail: string,
  toEmail: string
): Promise<DeliverabilityCheckResult> {
  try {
    // Extract domain from fromEmail
    const fromDomain = fromEmail.split("@")[1]?.toLowerCase();
    if (!fromDomain) {
      return {
        can_send: false,
        reason: "invalid_from_email",
        message: "Invalid from email address",
      };
    }

    // Get domain settings
    const { data: domainSettings, error: domainError } = await supabase
      .from("domain_settings")
      .select("*")
      .eq("org_id", organizationId)
      .eq("domain", fromDomain)
      .single();

    if (domainError || !domainSettings) {
      return {
        can_send: false,
        reason: "domain_not_configured",
        message: "Domain not configured. Please set up domain authentication first.",
        domain_settings_id: null,
      };
    }

    // Safeguard 1: Check if domain is authenticated (SPF/DKIM)
    if (!domainSettings.spf_pass || !domainSettings.dkim_pass) {
      return {
        can_send: false,
        reason: "domain_not_authenticated",
        message: "Domain authentication required. Please configure SPF and DKIM records.",
        domain_settings_id: domainSettings.id,
      };
    }

    // Safeguard 2: Check if sending is paused
    if (domainSettings.sending_paused) {
      return {
        can_send: false,
        reason: "sending_paused",
        message: domainSettings.pause_reason || "Sending is paused to protect your domain reputation.",
        domain_settings_id: domainSettings.id,
      };
    }

    // Safeguard 3: Run auto-pause check (may pause domain if thresholds breached)
    const { data: pauseCheck } = await supabase.rpc("auto_pause_domain_v2", {
      p_domain_settings_id: domainSettings.id,
    });

    if (pauseCheck?.paused) {
      return {
        can_send: false,
        reason: pauseCheck.reason || "auto_paused",
        message: pauseCheck.reason || "Domain automatically paused due to deliverability issues.",
        domain_settings_id: domainSettings.id,
      };
    }

    // Safeguard 4: Check warm-up status
    const { data: warmupState } = await supabase
      .from("domain_warmup_state")
      .select("*")
      .eq("domain_settings_id", domainSettings.id)
      .single();

    if (warmupState && warmupState.warmup_status === "warming") {
      // Check if daily limit reached
      if (warmupState.emails_sent_today >= warmupState.current_daily_limit) {
        return {
          can_send: false,
          reason: "warmup_limit_reached",
          message: `Daily warm-up limit reached: ${warmupState.emails_sent_today}/${warmupState.current_daily_limit}. Limit will reset tomorrow.`,
          domain_settings_id: domainSettings.id,
        };
      }
    }

    // Safeguard 5: Check deliverability score
    const { data: score } = await supabase.rpc("calculate_deliverability_score_v2", {
      p_domain_settings_id: domainSettings.id,
      p_period_type: "daily",
    });

    if (score !== null && score < 30) {
      return {
        can_send: false,
        reason: "low_deliverability_score",
        message: `Domain deliverability score too low: ${score.toFixed(1)}/100. Please fix authentication and reduce bounce/complaint rates.`,
        domain_settings_id: domainSettings.id,
      };
    }

    // All checks passed
    return {
      can_send: true,
      message: "All deliverability checks passed",
      domain_settings_id: domainSettings.id,
    };
  } catch (error: any) {
    console.error("Deliverability safeguard check error:", error);
    // Fail open on error (allow send but log)
    return {
      can_send: true,
      message: "Deliverability check error, allowing send",
    };
  }
}

/**
 * Record email event (bounce/complaint/delivered)
 */
export async function recordEmailEvent(
  organizationId: string,
  emailId: string | null,
  eventType: "delivered" | "bounced" | "complained" | "hard_bounce" | "soft_bounce" | "spam_complaint",
  metadata?: Record<string, any>
): Promise<void> {
  try {
    await supabase.from("email_events").insert({
      organization_id: organizationId,
      email_id: emailId,
      event_type: eventType,
      timestamp: new Date().toISOString(),
      extra: metadata || {},
    });

    // Trigger auto-pause check if bounce/complaint
    if (eventType.includes("bounce") || eventType.includes("complaint")) {
      // Find domain_settings_id from email
      const { data: emailLog } = await supabase
        .from("email_logs")
        .select("from_address, org_id")
        .eq("id", emailId)
        .single();

      if (emailLog?.from_address) {
        const domain = emailLog.from_address.split("@")[1]?.toLowerCase();
        if (domain) {
          const { data: domainSettings } = await supabase
            .from("domain_settings")
            .select("id")
            .eq("org_id", organizationId)
            .eq("domain", domain)
            .single();

          if (domainSettings) {
            await supabase.rpc("auto_pause_domain_v2", {
              p_domain_settings_id: domainSettings.id,
            });
          }
        }
      }
    }
  } catch (error) {
    console.error("Error recording email event:", error);
  }
}

/**
 * Update warm-up progress after sending email
 */
export async function updateWarmupAfterSend(
  domainSettingsId: string
): Promise<void> {
  try {
    // Update warmup progress
    await supabase.rpc("update_warmup_progress_v2", {
      p_domain_settings_id: domainSettingsId,
    });

    // Increment emails_sent_today
    await supabase.rpc("increment_warmup_sent", {
      p_domain_settings_id: domainSettingsId,
    });
  } catch (error) {
    console.error("Error updating warmup:", error);
  }
}
















































