// supabase/functions/daily-money-summary/index.ts
// Block 21720 — SmartSend Roofing Daily Money Summary Email v1
// Sends daily summary at 6:00 AM UTC (can be adjusted to roofer's timezone in v2)

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

const resendApiKey = Deno.env.get("RESEND_API_KEY");
const fromEmail = Deno.env.get("SMARTSEND_FROM_EMAIL") || "SmartSend <no-reply@smartsend.ai>";

type WorkspaceRow = {
  id: string;
  owner_id: string;
};

type CompanyNotificationsRow = {
  workspace_id: string;
  daily_summary_enabled: boolean;
};

type CompanySettingsRow = {
  workspace_id: string;
  company_email: string | null;
};

type SummaryRow = {
  hot_leads: number;
  warm_leads: number;
  replies_total: number;
  follow_ups_sent: number;
  jobs_booked: number;
  estimated_value: number;
};

async function getWorkspacesWithDailySummaryEnabled(): Promise<
  (WorkspaceRow & { owner_email: string | null })[]
> {
  // Get all workspaces that have daily_summary_enabled = true
  const { data: notifications, error: notificationsError } = await supabase
    .from("company_notifications")
    .select("workspace_id, daily_summary_enabled")
    .eq("daily_summary_enabled", true);

  if (notificationsError || !notifications) {
    console.error("Failed to fetch company_notifications", notificationsError);
    return [];
  }

  const workspaceIds = notifications.map((n) => n.workspace_id);

  if (workspaceIds.length === 0) {
    return [];
  }

  // Get workspace details
  const { data: workspaces, error: workspacesError } = await supabase
    .from("workspaces")
    .select("id, owner_id")
    .in("id", workspaceIds);

  if (workspacesError || !workspaces) {
    console.error("Failed to fetch workspaces", workspacesError);
    return [];
  }

  // Get owner emails
  const workspacesWithEmails = await Promise.all(
    workspaces.map(async (ws) => {
      let ownerEmail: string | null = null;

      // Try to get email from company_settings first
      const { data: companySettings } = await supabase
        .from("company_settings")
        .select("company_email")
        .eq("workspace_id", ws.id)
        .maybeSingle();

      if (companySettings?.company_email) {
        ownerEmail = companySettings.company_email;
      } else {
        // Fallback: get email from auth.users
        try {
          const { data: { user } } = await supabase.auth.admin.getUserById(ws.owner_id);
          ownerEmail = user?.email || null;
        } catch (e) {
          console.error(`Failed to get email for owner ${ws.owner_id}:`, e);
        }
      }

      return {
        ...ws,
        owner_email: ownerEmail,
      };
    })
  );

  return workspacesWithEmails.filter((ws) => ws.owner_email !== null);
}

async function getDailyMoneySummary(workspaceId: string): Promise<SummaryRow | null> {
  const { data, error } = await supabase.rpc("get_daily_money_summary", {
    p_workspace_id: workspaceId,
  });

  if (error) {
    console.error(`Failed to get daily summary for workspace ${workspaceId}:`, error);
    return null;
  }

  if (!data || data.length === 0) {
    return null;
  }

  return data[0] as SummaryRow;
}

function buildEmailHtml(row: SummaryRow): string {
  const {
    hot_leads,
    warm_leads,
    replies_total,
    follow_ups_sent,
    jobs_booked,
    estimated_value,
  } = row;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SmartSend Daily Money Summary</title>
</head>
<body style="font-family: Arial, sans-serif; padding: 20px; background-color: #f5f5f5;">
  <div style="max-width: 600px; margin: 0 auto; background-color: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
    <h2 style="margin-bottom: 10px; color: #1a1a1a;">SmartSend Daily Money Summary</h2>
    <p style="color: #555; margin-bottom: 30px;">
      Here's what SmartSend did for your roofing company yesterday:
    </p>

    <ul style="line-height: 1.7; font-size: 14px; list-style: none; padding: 0;">
      <li style="margin-bottom: 12px;">
        <strong>${follow_ups_sent}</strong> follow-ups sent
      </li>
      <li style="margin-bottom: 12px;">
        <strong>${replies_total}</strong> homeowner replies captured
      </li>
      <li style="margin-bottom: 12px;">
        <strong>${hot_leads}</strong> new <span style="color:#10b981; font-weight: bold;">HOT</span> leads
      </li>
      <li style="margin-bottom: 12px;">
        <strong>${warm_leads}</strong> new <span style="color:#f59e0b; font-weight: bold;">WARM</span> leads
      </li>
      <li style="margin-bottom: 12px;">
        <strong>${jobs_booked}</strong> jobs booked
      </li>
      <li style="margin-bottom: 12px; font-size: 16px;">
        <strong style="color: #10b981;">${formatCurrency(estimated_value)}</strong> estimated job value created
      </li>
    </ul>

    <p style="margin-top: 30px; color: #888; font-size: 12px; border-top: 1px solid #eee; padding-top: 20px;">
      SmartSend follows up with homeowners, books estimates, and finds money in your inbox — automatically.
    </p>
  </div>
</body>
</html>
  `;
}

async function sendEmailViaResend({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!resendApiKey) {
    console.warn("RESEND_API_KEY not set — skipping email send");
    return { ok: false, error: "RESEND_API_KEY not configured" };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to,
        subject,
        html,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Resend error:", errorText);
      return { ok: false, error: errorText };
    }

    return { ok: true };
  } catch (e) {
    console.error("Resend send error:", e);
    return { ok: false, error: String(e) };
  }
}

Deno.serve(async () => {
  try {
    // 1) Get all workspaces that want daily summaries
    const workspaces = await getWorkspacesWithDailySummaryEnabled();

    if (workspaces.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, processed: 0, message: "No workspaces with daily summary enabled" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    let processed = 0;
    let errors = 0;

    for (const workspace of workspaces) {
      const workspaceId = workspace.id;
      const ownerEmail = workspace.owner_email;

      if (!ownerEmail) {
        console.warn(`No email found for workspace ${workspaceId}, skipping`);
        continue;
      }

      // 2) Get yesterday's stats
      const summary = await getDailyMoneySummary(workspaceId);

      if (!summary) {
        console.warn(`No summary data for workspace ${workspaceId}, skipping`);
        continue;
      }

      // 3) Build email body
      const html = buildEmailHtml(summary);

      // 4) Send email via Resend
      const emailResult = await sendEmailViaResend({
        to: ownerEmail,
        subject: "Your Daily SmartSend Money Summary",
        html,
      });

      if (emailResult.ok) {
        processed++;
        console.log(`Sent daily summary to ${ownerEmail} for workspace ${workspaceId}`);
      } else {
        errors++;
        console.error(
          `Failed to send daily summary to ${ownerEmail} for workspace ${workspaceId}:`,
          emailResult.error
        );
      }
    }

    return new Response(
      JSON.stringify({ ok: true, processed, errors }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("daily-money-summary error", e);
    return new Response(
      JSON.stringify({ ok: false, error: String(e) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
