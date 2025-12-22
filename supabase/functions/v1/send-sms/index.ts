// Block 459 — SMS Sending Engine
// Edge Function to send SMS via Twilio / custom provider
// Supports SMS steps in multi-channel sequences

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

interface SMSQueueItem {
  id: string;
  lead_id: string;
  campaign_id: string;
  campaign_step_id?: string;
  sms_to_phone: string;
  sms_body: string;
  sms_provider: string;
  scheduled_at: string;
  status: string;
}

interface SMSProviderConfig {
  account_sid?: string;
  auth_token?: string;
  from_number?: string;
  api_key?: string;
  api_secret?: string;
}

/**
 * Send SMS via Twilio
 */
async function sendViaTwilio(
  to: string,
  body: string,
  config: SMSProviderConfig
): Promise<{ success: boolean; message_id?: string; error?: string }> {
  if (!config.account_sid || !config.auth_token || !config.from_number) {
    return { success: false, error: "Missing Twilio configuration" };
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${config.account_sid}/Messages.json`;
  const auth = btoa(`${config.account_sid}:${config.auth_token}`);

  try {
    const formData = new URLSearchParams();
    formData.append("To", to);
    formData.append("From", config.from_number);
    formData.append("Body", body);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData.toString(),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.message || `Twilio error: ${response.status}`,
      };
    }

    return {
      success: true,
      message_id: data.sid,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Send SMS via Nexmo/Vonage
 */
async function sendViaNexmo(
  to: string,
  body: string,
  config: SMSProviderConfig
): Promise<{ success: boolean; message_id?: string; error?: string }> {
  if (!config.api_key || !config.api_secret || !config.from_number) {
    return { success: false, error: "Missing Nexmo configuration" };
  }

  const url = "https://rest.nexmo.com/sms/json";
  const params = new URLSearchParams({
    api_key: config.api_key,
    api_secret: config.api_secret,
    to: to,
    from: config.from_number,
    text: body,
  });

  try {
    const response = await fetch(`${url}?${params.toString()}`, {
      method: "POST",
    });

    const data = await response.json();

    if (data.messages?.[0]?.status !== "0") {
      return {
        success: false,
        error: data.messages?.[0]?.["error-text"] || "Nexmo error",
      };
    }

    return {
      success: true,
      message_id: data.messages[0]["message-id"],
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Send SMS via Telnyx
 */
async function sendViaTelnyx(
  to: string,
  body: string,
  config: SMSProviderConfig
): Promise<{ success: boolean; message_id?: string; error?: string }> {
  if (!config.api_key || !config.from_number) {
    return { success: false, error: "Missing Telnyx configuration" };
  }

  const url = "https://api.telnyx.com/v2/messages";
  const auth = `Bearer ${config.api_key}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": auth,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: to,
        from: config.from_number,
        text: body,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.errors?.[0]?.detail || `Telnyx error: ${response.status}`,
      };
    }

    return {
      success: true,
      message_id: data.data.id,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Check if phone number is suppressed
 */
async function isSuppressed(
  phone: string,
  workspace_id?: string
): Promise<boolean> {
  const { data } = await supabase
    .from("sms_suppressions")
    .select("id")
    .eq("phone_number", phone)
    .or(`workspace_id.eq.${workspace_id},workspace_id.is.null`)
    .limit(1);

  return (data?.length ?? 0) > 0;
}

/**
 * Get provider configuration from workspace settings or environment
 */
async function getProviderConfig(
  provider: string,
  workspace_id?: string
): Promise<SMSProviderConfig> {
  // Try to get from workspace settings first
  if (workspace_id) {
    const { data } = await supabase
      .from("workspace_settings")
      .select("sms_config")
      .eq("workspace_id", workspace_id)
      .single();

    if (data?.sms_config?.[provider]) {
      return data.sms_config[provider];
    }
  }

  // Fall back to environment variables
  const envPrefix = provider.toUpperCase();
  return {
    account_sid: Deno.env.get(`${envPrefix}_ACCOUNT_SID`),
    auth_token: Deno.env.get(`${envPrefix}_AUTH_TOKEN`),
    from_number: Deno.env.get(`${envPrefix}_FROM_NUMBER`),
    api_key: Deno.env.get(`${envPrefix}_API_KEY`),
    api_secret: Deno.env.get(`${envPrefix}_API_SECRET`),
  };
}

/**
 * Process a single SMS queue item
 */
async function processSMSQueueItem(item: SMSQueueItem): Promise<void> {
  // Check if suppressed
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("workspace_id")
    .eq("id", item.campaign_id)
    .single();

  if (await isSuppressed(item.sms_to_phone, campaign?.workspace_id)) {
    await supabase
      .from("send_queue")
      .update({
        status: "failed",
        sms_status: "failed",
        sms_error_message: "Phone number is suppressed",
      })
      .eq("id", item.id);

    return;
  }

  // Get provider configuration
  const config = await getProviderConfig(item.sms_provider, campaign?.workspace_id);

  // Send SMS based on provider
  let result: { success: boolean; message_id?: string; error?: string };

  switch (item.sms_provider.toLowerCase()) {
    case "twilio":
      result = await sendViaTwilio(item.sms_to_phone, item.sms_body, config);
      break;
    case "nexmo":
    case "vonage":
      result = await sendViaNexmo(item.sms_to_phone, item.sms_body, config);
      break;
    case "telnyx":
      result = await sendViaTelnyx(item.sms_to_phone, item.sms_body, config);
      break;
    default:
      result = { success: false, error: `Unsupported provider: ${item.sms_provider}` };
  }

  // Update send_queue with result
  if (result.success) {
    await supabase
      .from("send_queue")
      .update({
        status: "sent",
        sms_status: "sent",
        sms_provider_message_id: result.message_id,
        sent_at: new Date().toISOString(),
      })
      .eq("id", item.id);

    // Create SMS stats entry
    await supabase.from("sms_stats").insert({
      campaign_id: item.campaign_id,
      campaign_step_id: item.campaign_step_id,
      lead_id: item.lead_id,
      send_queue_id: item.id,
      workspace_id: campaign?.workspace_id,
      sent_at: new Date().toISOString(),
      provider: item.sms_provider,
      provider_message_id: result.message_id,
      provider_status: "sent",
    });

    // Log activity
    await supabase.from("activity_log").insert({
      workspace_id: campaign?.workspace_id,
      campaign_id: item.campaign_id,
      lead_id: item.lead_id,
      activity_type: "sms_sent",
      activity_data: {
        provider: item.sms_provider,
        message_id: result.message_id,
        phone: item.sms_to_phone,
      },
    });
  } else {
    await supabase
      .from("send_queue")
      .update({
        status: "failed",
        sms_status: "failed",
        sms_error_message: result.error,
        sms_failed_at: new Date().toISOString(),
      })
      .eq("id", item.id);

    // Log failure
    await supabase.from("activity_log").insert({
      workspace_id: campaign?.workspace_id,
      campaign_id: item.campaign_id,
      lead_id: item.lead_id,
      activity_type: "sms_failed",
      activity_data: {
        provider: item.sms_provider,
        error: result.error,
        phone: item.sms_to_phone,
      },
    });
  }
}

/**
 * Main handler
 */
Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const payload = await req.json();
    const { queue_id, batch = false } = payload;

    // Process single queue item
    if (queue_id) {
      const { data: item, error } = await supabase
        .from("send_queue")
        .select("*")
        .eq("id", queue_id)
        .eq("queue_type", "sms")
        .eq("status", "pending")
        .single();

      if (error || !item) {
        return new Response(
          JSON.stringify({ error: "Queue item not found or not ready" }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        );
      }

      await processSMSQueueItem(item as SMSQueueItem);

      return new Response(
        JSON.stringify({ ok: true, processed: queue_id }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Process batch of ready SMS items
    if (batch) {
      const { data: items, error } = await supabase
        .from("send_queue")
        .select("*")
        .eq("queue_type", "sms")
        .eq("status", "pending")
        .lte("scheduled_at", new Date().toISOString())
        .order("scheduled_at", { ascending: true })
        .limit(10);

      if (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }

      const processed = [];
      for (const item of items || []) {
        await processSMSQueueItem(item as SMSQueueItem);
        processed.push(item.id);
      }

      return new Response(
        JSON.stringify({ ok: true, processed, count: processed.length }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Missing queue_id or batch flag" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("SMS send error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});



