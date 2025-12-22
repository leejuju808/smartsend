// Block 23280 — SmartSend Quality & Reliability Monitoring v1
// Edge Function: /system/alert
// 
// This function sends alerts when critical errors occur.
// Triggered automatically via database trigger on system_errors table.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false },
});

interface AlertPayload {
  error_id: string;
  source: string;
  message: string;
  created_at: string;
  details?: any;
}

interface AlertConfig {
  email_enabled: boolean;
  slack_enabled: boolean;
  sms_enabled: boolean;
  owner_email?: string;
  slack_webhook_url?: string;
  sms_number?: string;
}

// Get alert configuration
async function getAlertConfig(): Promise<AlertConfig> {
  // Default configuration - can be overridden via environment variables
  return {
    email_enabled: Deno.env.get("ALERT_EMAIL_ENABLED") === "true",
    slack_enabled: Deno.env.get("ALERT_SLACK_ENABLED") === "true",
    sms_enabled: Deno.env.get("ALERT_SMS_ENABLED") === "true",
    owner_email: Deno.env.get("OWNER_EMAIL") || Deno.env.get("ALERT_EMAIL"),
    slack_webhook_url: Deno.env.get("SLACK_WEBHOOK_URL"),
    sms_number: Deno.env.get("SMS_NUMBER"),
  };
}

// Send email alert
async function sendEmailAlert(payload: AlertPayload, config: AlertConfig): Promise<boolean> {
  if (!config.email_enabled || !config.owner_email) {
    return false;
  }

  try {
    const subject = `🚨 SmartSend Critical Error: ${payload.source}`;
    const body = `
Critical Error Detected

Source: ${payload.source}
Error ID: ${payload.error_id}
Message: ${payload.message}
Time: ${payload.created_at}

Details:
${JSON.stringify(payload.details || {}, null, 2)}

View in dashboard: ${supabaseUrl.replace("/rest/v1", "")}/dashboard/reliability
    `.trim();

    // Use Supabase's email service or external email API
    // For now, we'll use a simple fetch to an email API if configured
    const emailApiUrl = Deno.env.get("EMAIL_API_URL");
    if (emailApiUrl) {
      const response = await fetch(emailApiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: config.owner_email,
          subject,
          body,
        }),
      });
      return response.ok;
    }

    // Log to system_errors if email fails
    console.error("Email alert not configured - EMAIL_API_URL not set");
    return false;
  } catch (error) {
    console.error("Failed to send email alert:", error);
    return false;
  }
}

// Send Slack alert
async function sendSlackAlert(payload: AlertPayload, config: AlertConfig): Promise<boolean> {
  if (!config.slack_enabled || !config.slack_webhook_url) {
    return false;
  }

  try {
    const slackMessage = {
      text: `🚨 SmartSend Critical Error`,
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: "🚨 Critical Error Detected",
          },
        },
        {
          type: "section",
          fields: [
            {
              type: "mrkdwn",
              text: `*Source:*\n${payload.source}`,
            },
            {
              type: "mrkdwn",
              text: `*Error ID:*\n\`${payload.error_id}\``,
            },
            {
              type: "mrkdwn",
              text: `*Message:*\n${payload.message}`,
            },
            {
              type: "mrkdwn",
              text: `*Time:*\n${payload.created_at}`,
            },
          ],
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Details:*\n\`\`\`${JSON.stringify(payload.details || {}, null, 2)}\`\`\``,
          },
        },
      ],
    };

    const response = await fetch(config.slack_webhook_url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(slackMessage),
    });

    return response.ok;
  } catch (error) {
    console.error("Failed to send Slack alert:", error);
    return false;
  }
}

// Send SMS alert (via Twilio or similar)
async function sendSMSAlert(payload: AlertPayload, config: AlertConfig): Promise<boolean> {
  if (!config.sms_enabled || !config.sms_number) {
    return false;
  }

  try {
    const twilioAccountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const twilioAuthToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    const twilioFromNumber = Deno.env.get("TWILIO_FROM_NUMBER");

    if (!twilioAccountSid || !twilioAuthToken || !twilioFromNumber) {
      console.error("SMS alert not configured - Twilio credentials missing");
      return false;
    }

    const message = `🚨 SmartSend Critical Error: ${payload.source} - ${payload.message}`;

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${btoa(`${twilioAccountSid}:${twilioAuthToken}`)}`,
        },
        body: new URLSearchParams({
          From: twilioFromNumber,
          To: config.sms_number!,
          Body: message,
        }),
      }
    );

    return response.ok;
  } catch (error) {
    console.error("Failed to send SMS alert:", error);
    return false;
  }
}

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    const payload: AlertPayload = await req.json();

    // Validate payload
    if (!payload.error_id || !payload.source || !payload.message) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: error_id, source, message" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Fetch full error details from database
    const { data: error, error: dbError } = await supabase
      .from("system_errors")
      .select("*")
      .eq("id", payload.error_id)
      .single();

    if (dbError || !error) {
      console.error("Failed to fetch error details:", dbError);
    } else {
      payload.details = error.details;
    }

    // Get alert configuration
    const config = await getAlertConfig();

    // Send alerts via all configured channels
    const results = {
      email: await sendEmailAlert(payload, config),
      slack: await sendSlackAlert(payload, config),
      sms: await sendSMSAlert(payload, config),
    };

    // Log alert attempt
    await supabase.from("system_logs").insert({
      category: "reliability_alerts",
      level: "info",
      message: `Alert sent for critical error: ${payload.error_id}`,
      context: {
        error_id: payload.error_id,
        source: payload.source,
        channels: results,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        error_id: payload.error_id,
        alerts_sent: results,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Alert function error:", error);
    
    // Log the error itself
    await supabase.from("system_errors").insert({
      source: "system-alert",
      severity: "error",
      message: `Alert function failed: ${error instanceof Error ? error.message : String(error)}`,
      details: { stack: error instanceof Error ? error.stack : undefined },
    }).catch(() => {}); // Prevent infinite loop

    return new Response(
      JSON.stringify({
        error: "Failed to send alert",
        details: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});







































