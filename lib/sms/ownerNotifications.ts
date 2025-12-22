// lib/sms/ownerNotifications.ts
// Block 9700 — SMS Forwarding v1: Owner notification service

import { createClient } from "@/lib/supabase/server";
import { sendSMS, normalizePhoneNumber, SendSMSResult } from "@/lib/providers/sms";

export interface OwnerNotificationMetadata {
  contactId?: string;
  campaignId?: string;
  routingEventId?: string;
}

export interface SendOwnerSMSResult {
  status: "sent" | "failed" | "skipped";
  providerId?: string;
  error?: string;
  skipReason?: string;
}

/**
 * Check if account has SMS feature enabled (Growth or Domination plan)
 */
async function checkBillingGuard(
  supabase: ReturnType<typeof createClient>,
  accountId: string
): Promise<{ allowed: boolean; reason?: string }> {
  // Get account plan
  const { data: account, error } = await supabase
    .from("accounts")
    .select("current_plan")
    .eq("id", accountId)
    .single();

  if (error || !account) {
    return { allowed: false, reason: "Account not found" };
  }

  const plan = account.current_plan?.toLowerCase();

  // V1: SMS only on Growth + Domination
  if (plan !== "growth" && plan !== "domination") {
    return {
      allowed: false,
      reason: `SMS alerts require Growth or Domination plan (current: ${plan})`,
    };
  }

  return { allowed: true };
}

/**
 * Get notification settings for account
 */
async function getNotificationSettings(
  supabase: ReturnType<typeof createClient>,
  accountId: string
) {
  const { data, error } = await supabase
    .from("notification_settings")
    .select("*")
    .eq("account_id", accountId)
    .maybeSingle();

  if (error) {
    console.error("Error fetching notification settings:", error);
    return null;
  }

  return data;
}

// Quiet hours check is now done via database function is_quiet_hours

/**
 * Check rate limiting using database function
 */
async function checkRateLimit(
  supabase: ReturnType<typeof createClient>,
  accountId: string,
  toPhone: string
): Promise<boolean> {
  const { data, error } = await supabase.rpc("check_sms_rate_limit", {
    p_account_id: accountId,
    p_to_phone: toPhone,
    p_max_per_lead_minutes: 10,
    p_max_per_account_hour: 20,
  });

  if (error) {
    console.error("Rate limit check error:", error);
    // Fail open - allow SMS if check fails
    return true;
  }

  return data === true;
}

/**
 * Log SMS attempt to sms_logs table
 */
async function logSMS(
  supabase: ReturnType<typeof createClient>,
  accountId: string,
  toPhone: string,
  body: string,
  status: "queued" | "sent" | "failed" | "skipped",
  metadata: OwnerNotificationMetadata,
  providerMessageId?: string,
  errorMessage?: string
) {
  const { error } = await supabase.from("sms_logs").insert({
    account_id: accountId,
    contact_id: metadata.contactId || null,
    campaign_id: metadata.campaignId || null,
    routing_event_id: metadata.routingEventId || null,
    to_phone: toPhone,
    body,
    status,
    provider_message_id: providerMessageId || null,
    error_message: errorMessage || null,
  });

  if (error) {
    console.error("Error logging SMS:", error);
  }
}

/**
 * Send SMS to owner (main service function)
 */
export async function sendOwnerSMS({
  accountId,
  body,
  metadata,
  smsType,
}: {
  accountId: string;
  body: string;
  metadata: OwnerNotificationMetadata;
  smsType: "hot_lead" | "warm_lead" | "estimate_scheduled" | "won";
}): Promise<SendOwnerSMSResult> {
  const supabase = createClient();

  // 1) Check Billing Guard
  const billingCheck = await checkBillingGuard(supabase, accountId);
  if (!billingCheck.allowed) {
    await logSMS(
      supabase,
      accountId,
      "", // Phone not known yet
      body,
      "skipped",
      metadata,
      undefined,
      billingCheck.reason
    );
    return {
      status: "skipped",
      skipReason: billingCheck.reason,
    };
  }

  // 2) Get notification settings
  const settings = await getNotificationSettings(supabase, accountId);
  if (!settings || !settings.sms_enabled || !settings.owner_phone) {
    await logSMS(
      supabase,
      accountId,
      "",
      body,
      "skipped",
      metadata,
      undefined,
      "SMS not enabled or owner phone not set"
    );
    return {
      status: "skipped",
      skipReason: "SMS not enabled or owner phone not set",
    };
  }

  // 3) Check if this SMS type is enabled
  let smsTypeEnabled = false;
  switch (smsType) {
    case "hot_lead":
      smsTypeEnabled = settings.sms_hot_leads;
      break;
    case "warm_lead":
      smsTypeEnabled = settings.sms_warm_leads;
      break;
    case "estimate_scheduled":
      smsTypeEnabled = settings.sms_estimate_scheduled;
      break;
    case "won":
      smsTypeEnabled = settings.sms_won_jobs;
      break;
  }

  if (!smsTypeEnabled) {
    await logSMS(
      supabase,
      accountId,
      settings.owner_phone,
      body,
      "skipped",
      metadata,
      undefined,
      `SMS type ${smsType} not enabled`
    );
    return {
      status: "skipped",
      skipReason: `SMS type ${smsType} not enabled`,
    };
  }

  const normalizedTo = normalizePhoneNumber(settings.owner_phone);
  if (!normalizedTo) {
    await logSMS(
      supabase,
      accountId,
      settings.owner_phone,
      body,
      "failed",
      metadata,
      undefined,
      "Invalid owner phone number format"
    );
    return {
      status: "failed",
      error: "Invalid owner phone number format",
    };
  }

  // 3) Check quiet hours using database function
  if (settings.quiet_hours_start && settings.quiet_hours_end) {
    const { data: isQuiet } = await supabase.rpc("is_quiet_hours", {
      p_quiet_start: settings.quiet_hours_start,
      p_quiet_end: settings.quiet_hours_end,
      p_now: new Date().toISOString(),
    });

    if (isQuiet === true) {
      await logSMS(
        supabase,
        accountId,
        normalizedTo,
        body,
        "skipped",
        metadata,
        undefined,
        "Quiet hours active"
      );
      return {
        status: "skipped",
        skipReason: "Quiet hours active",
      };
    }
  }

  // 4) Check rate limiting
  const rateLimitOk = await checkRateLimit(supabase, accountId, normalizedTo);
  if (!rateLimitOk) {
    await logSMS(
      supabase,
      accountId,
      normalizedTo,
      body,
      "skipped",
      metadata,
      undefined,
      "Rate limit exceeded"
    );
    return {
      status: "skipped",
      skipReason: "Rate limit exceeded",
    };
  }

  // 5) Get SMS provider config from environment variables
  // For V1, we use system-wide Twilio credentials
  // In future, this could be per-account or per-organization
  const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!twilioAccountSid || !twilioAuthToken || !twilioPhoneNumber) {
    const errorMsg = "SMS provider not configured";
    await logSMS(
      supabase,
      accountId,
      normalizedTo,
      body,
      "failed",
      metadata,
      undefined,
      errorMsg
    );
    return {
      status: "failed",
      error: errorMsg,
    };
  }

  // 6) Send SMS via provider
  const smsResult: SendSMSResult = await sendSMS(normalizedTo, body, {
    provider: "twilio",
    credentials: {
      accountSid: twilioAccountSid,
      authToken: twilioAuthToken,
      phoneNumber: twilioPhoneNumber,
    },
  });

  // 7) Log result
  if (smsResult.success) {
    await logSMS(
      supabase,
      accountId,
      normalizedTo,
      body,
      "sent",
      metadata,
      smsResult.providerMessageId
    );
    return {
      status: "sent",
      providerId: smsResult.providerMessageId,
    };
  } else {
    await logSMS(
      supabase,
      accountId,
      normalizedTo,
      body,
      "failed",
      metadata,
      undefined,
      smsResult.error
    );
    return {
      status: "failed",
      error: smsResult.error,
    };
  }
}

/**
 * Build SMS message for hot lead
 */
export function buildHotLeadSMS({
  homeownerName,
  city,
  summary,
  nextAction,
}: {
  homeownerName: string | null;
  city: string | null;
  summary: string | null;
  nextAction: string | null;
}): string {
  const name = homeownerName || "Lead";
  const location = city ? ` in ${city}` : "";
  const summaryText = summary ? `\nSummary: ${summary}` : "";
  const actionText = nextAction
    ? `\nNext: ${nextAction} (call or text them now).`
    : "\nCall or text them now.";

  return `New HOT roofing lead: ${name}${location}.${summaryText}${actionText}`;
}

/**
 * Build SMS message for warm lead
 */
export function buildWarmLeadSMS({
  homeownerName,
  city,
  summary,
  nextAction,
}: {
  homeownerName: string | null;
  city: string | null;
  summary: string | null;
  nextAction: string | null;
}): string {
  const name = homeownerName || "Lead";
  const location = city ? ` in ${city}` : "";
  const summaryText = summary ? `\nSummary: ${summary}` : "";
  const actionText = nextAction ? `\nNext: ${nextAction}.` : "";

  return `Warm lead: ${name}${location}.${summaryText}${actionText}`;
}

/**
 * Build SMS message for estimate scheduled
 */
export function buildEstimateScheduledSMS({
  homeownerName,
  city,
}: {
  homeownerName: string | null;
  city: string | null;
}): string {
  const name = homeownerName || "Lead";
  const location = city ? ` in ${city}` : "";

  return `Estimate scheduled for ${name}${location}.\nStage updated inside SmartSend.`;
}

/**
 * Build SMS message for job won
 */
export function buildJobWonSMS({
  homeownerName,
  city,
  estimatedValue,
}: {
  homeownerName: string | null;
  city: string | null;
  estimatedValue?: number | null;
}): string {
  const name = homeownerName || "Lead";
  const location = city ? ` in ${city}` : "";
  const valueText = estimatedValue
    ? `\nEst. value: $${estimatedValue.toLocaleString()}.`
    : "";

  return `Job marked WON: ${name}${location}.${valueText}`;
}

