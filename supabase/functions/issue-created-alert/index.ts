// Block 251700 — SmartSend Crew Issue Reporting System v1
// Edge Function: issue-created-alert
// 
// This function sends alerts when critical issues are created or updated.
// Triggered automatically when issues are created with high/critical severity.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false },
});

interface AlertPayload {
  issue_id: string;
  severity: string;
  issue_type: string;
  title: string;
  job_id?: string | null;
  status?: string;
}

interface AlertConfig {
  email_enabled: boolean;
  slack_enabled: boolean;
  slack_webhook_url?: string;
  owner_email?: string;
}

// Get alert configuration
async function getAlertConfig(): Promise<AlertConfig> {
  return {
    email_enabled: Deno.env.get("ALERT_EMAIL_ENABLED") === "true",
    slack_enabled: Deno.env.get("ALERT_SLACK_ENABLED") === "true",
    slack_webhook_url: Deno.env.get("SLACK_WEBHOOK_URL"),
    owner_email: Deno.env.get("OWNER_EMAIL") || Deno.env.get("ALERT_EMAIL"),
  };
}

// Get issue details from database
async function getIssueDetails(issueId: string) {
  const { data, error } = await supabase
    .from("crew_issues")
    .select(`
      *,
      jobs:job_id (
        id,
        job_name,
        title,
        address
      ),
      workforce_employees:employee_id (
        id,
        first_name,
        last_name
      )
    `)
    .eq("id", issueId)
    .single();

  if (error) {
    console.error("Error fetching issue details:", error);
    return null;
  }

  return data;
}

// Send Slack alert
async function sendSlackAlert(payload: AlertPayload, issueDetails: any, config: AlertConfig): Promise<boolean> {
  if (!config.slack_enabled || !config.slack_webhook_url) {
    return false;
  }

  try {
    const severityEmoji = payload.severity === "critical" ? "🚨" : "⚠️";
    const jobInfo = issueDetails?.jobs
      ? `Job: ${issueDetails.jobs.job_name || issueDetails.jobs.title || "Unknown"}`
      : "Job: Not specified";
    const employeeInfo = issueDetails?.workforce_employees
      ? `Crew: ${issueDetails.workforce_employees.first_name} ${issueDetails.workforce_employees.last_name}`
      : "Crew: Unknown";
    const appUrl = supabaseUrl.replace("/rest/v1", "").replace("https://", "https://app.");
    const issueUrl = `${appUrl}/workforce/issues/${payload.issue_id}`;

    const slackMessage = {
      text: `${severityEmoji} New ${payload.severity.toUpperCase()} Issue Reported`,
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: `${severityEmoji} New ${payload.severity.toUpperCase()} Issue`,
          },
        },
        {
          type: "section",
          fields: [
            {
              type: "mrkdwn",
              text: `*Type:*\n${payload.issue_type}`,
            },
            {
              type: "mrkdwn",
              text: `*Severity:*\n${payload.severity.toUpperCase()}`,
            },
            {
              type: "mrkdwn",
              text: `*Title:*\n${payload.title}`,
            },
            {
              type: "mrkdwn",
              text: `*${jobInfo}*\n${employeeInfo}`,
            },
          ],
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `<${issueUrl}|View Issue in SmartSend →>`,
          },
        },
      ],
    };

    const response = await fetch(config.slack_webhook_url!, {
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

// Send email alert
async function sendEmailAlert(payload: AlertPayload, issueDetails: any, config: AlertConfig): Promise<boolean> {
  if (!config.email_enabled || !config.owner_email) {
    return false;
  }

  try {
    const severityEmoji = payload.severity === "critical" ? "🚨" : "⚠️";
    const subject = `${severityEmoji} SmartSend: New ${payload.severity.toUpperCase()} Issue - ${payload.title}`;
    
    const jobInfo = issueDetails?.jobs
      ? `Job: ${issueDetails.jobs.job_name || issueDetails.jobs.title || "Unknown"}\n`
      : "";
    const employeeInfo = issueDetails?.workforce_employees
      ? `Reported by: ${issueDetails.workforce_employees.first_name} ${issueDetails.workforce_employees.last_name}\n`
      : "";
    const appUrl = supabaseUrl.replace("/rest/v1", "").replace("https://", "https://app.");
    const issueUrl = `${appUrl}/workforce/issues/${payload.issue_id}`;

    const body = `
${severityEmoji} New ${payload.severity.toUpperCase()} Issue Reported

Type: ${payload.issue_type}
Severity: ${payload.severity.toUpperCase()}
Title: ${payload.title}
${jobInfo}${employeeInfo}
Description: ${issueDetails?.description || "No description provided"}

View Issue: ${issueUrl}
    `.trim();

    // Use email API if configured
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

    console.error("Email alert not configured - EMAIL_API_URL not set");
    return false;
  } catch (error) {
    console.error("Failed to send email alert:", error);
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
    if (!payload.issue_id || !payload.severity || !payload.title) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: issue_id, severity, title" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Only alert for high/critical severity
    if (payload.severity !== "high" && payload.severity !== "critical") {
      return new Response(
        JSON.stringify({ success: true, message: "Issue severity below alert threshold" }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Fetch full issue details
    const issueDetails = await getIssueDetails(payload.issue_id);

    // Get alert configuration
    const config = await getAlertConfig();

    // Send alerts via all configured channels
    const results = {
      slack: await sendSlackAlert(payload, issueDetails, config),
      email: await sendEmailAlert(payload, issueDetails, config),
    };

    return new Response(
      JSON.stringify({
        success: true,
        issue_id: payload.issue_id,
        alerts_sent: results,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Alert function error:", error);
    
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
























