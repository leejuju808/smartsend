// Block 22920 — SmartSend Roofing AI Daily Digest v1
// Sends daily AI insights summary at 6:00 AM to roofing owners
// "Good morning — here's your roofing intel for today."

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false },
});

const resendApiKey = Deno.env.get("RESEND_API_KEY");
const fromEmail = Deno.env.get("SMARTSEND_FROM_EMAIL") || "SmartSend <no-reply@smartsend.ai>";

type WorkspaceRow = {
  id: string;
  owner_id: string;
};

type AIInsight = {
  id: string;
  job_id: string | null;
  category: string;
  severity: string;
  message: string;
  recommendation: string | null;
  created_at: string;
};

type Job = {
  id: string;
  title: string | null;
  address: string | null;
};

async function getWorkspacesWithOwners(): Promise<
  (WorkspaceRow & { owner_email: string | null })[]
> {
  // Get all active workspaces
  const { data: workspaces, error: workspacesError } = await supabase
    .from("workspaces")
    .select("id, owner_id")
    .eq("is_active", true);

  if (workspacesError || !workspaces) {
    console.error("Failed to fetch workspaces", workspacesError);
    return [];
  }

  // Get owner emails
  const workspacesWithEmails = await Promise.all(
    workspaces.map(async (ws) => {
      let ownerEmail: string | null = null;

      try {
        const { data: { user } } = await supabase.auth.admin.getUserById(ws.owner_id);
        ownerEmail = user?.email || null;
      } catch (e) {
        console.error(`Failed to get email for owner ${ws.owner_id}:`, e);
      }

      return {
        ...ws,
        owner_email: ownerEmail,
      };
    })
  );

  return workspacesWithEmails.filter((ws) => ws.owner_email !== null);
}

async function getAIInsightsForWorkspace(workspaceId: string): Promise<{
  critical: AIInsight[];
  warnings: AIInsight[];
  info: AIInsight[];
  jobsAtRisk: number;
}> {
  // Get unresolved insights from last 24 hours
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  const { data: insights, error } = await supabase
    .from("ai_insights")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("resolved", false)
    .gte("created_at", yesterday.toISOString())
    .order("created_at", { ascending: false });

  if (error) {
    console.error(`Error fetching insights for workspace ${workspaceId}:`, error);
    return { critical: [], warnings: [], info: [], jobsAtRisk: 0 };
  }

  const critical = (insights || []).filter((i) => i.severity === "critical");
  const warnings = (insights || []).filter((i) => i.severity === "warning");
  const info = (insights || []).filter((i) => i.severity === "info");

  // Count unique jobs at risk
  const jobIds = new Set(
    [...critical, ...warnings]
      .map((i) => i.job_id)
      .filter((id): id is string => id !== null)
  );
  const jobsAtRisk = jobIds.size;

  return { critical, warnings, info, jobsAtRisk };
}

async function getJobTitle(jobId: string): Promise<string> {
  const { data: job } = await supabase
    .from("roofing_jobs")
    .select("title, address")
    .eq("id", jobId)
    .maybeSingle();

  if (!job) return "Unknown Job";
  return job.title || job.address || "Untitled Job";
}

function buildEmailHtml({
  critical,
  warnings,
  info,
  jobsAtRisk,
}: {
  critical: AIInsight[];
  warnings: AIInsight[];
  info: AIInsight[];
  jobsAtRisk: number;
}): string {
  const getCategoryLabel = (category: string) => {
    const labels: Record<string, string> = {
      margin_risk: "Margin Risk",
      schedule_risk: "Schedule Risk",
      material_risk: "Material Risk",
      labor_risk: "Labor Risk",
      payment_risk: "Payment Risk",
      forecast_update: "Forecast Update",
      general_insight: "Insight",
    };
    return labels[category] || category;
  };

  const totalAlerts = critical.length + warnings.length;

  let html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Daily Roofing Intel</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 8px 8px 0 0; color: white;">
    <h1 style="margin: 0; font-size: 24px;">Good morning — here's your roofing intel for today.</h1>
    <p style="margin: 10px 0 0 0; opacity: 0.9;">SmartSend AI Intelligence Layer</p>
  </div>

  <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px;">
`;

  if (totalAlerts === 0) {
    html += `
    <div style="background: white; padding: 20px; border-radius: 8px; border-left: 4px solid #10b981;">
      <h2 style="margin: 0 0 10px 0; color: #10b981; font-size: 18px;">✅ All Clear</h2>
      <p style="margin: 0; color: #6b7280;">No critical alerts. All jobs operating normally.</p>
    </div>
    `;
  } else {
    // Jobs at Risk Summary
    if (jobsAtRisk > 0) {
      html += `
    <div style="background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #ef4444;">
      <h2 style="margin: 0 0 10px 0; color: #ef4444; font-size: 18px;">🔥 Jobs at Risk</h2>
      <p style="margin: 0; color: #6b7280; font-size: 16px;"><strong>${jobsAtRisk}</strong> job${jobsAtRisk !== 1 ? "s" : ""} requiring immediate attention</p>
    </div>
    `;
    }

    // Critical Alerts
    if (critical.length > 0) {
      html += `
    <div style="background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #ef4444;">
      <h2 style="margin: 0 0 15px 0; color: #ef4444; font-size: 18px;">🚨 Critical Alerts (${critical.length})</h2>
    `;

      for (const insight of critical.slice(0, 5)) {
        html += `
      <div style="padding: 15px; background: #fef2f2; border-radius: 6px; margin-bottom: 10px;">
        <div style="font-size: 12px; font-weight: 600; color: #991b1b; text-transform: uppercase; margin-bottom: 5px;">
          ${getCategoryLabel(insight.category)} — CRITICAL
        </div>
        <p style="margin: 0 0 8px 0; color: #1f2937;">${insight.message}</p>
        ${insight.recommendation ? `<p style="margin: 0; color: #4b5563; font-size: 14px;"><strong>Recommendation:</strong> ${insight.recommendation}</p>` : ""}
      </div>
      `;
      }

      html += `</div>`;
    }

    // Warnings
    if (warnings.length > 0) {
      html += `
    <div style="background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #f59e0b;">
      <h2 style="margin: 0 0 15px 0; color: #f59e0b; font-size: 18px;">⚠️ Warnings (${warnings.length})</h2>
    `;

      for (const insight of warnings.slice(0, 5)) {
        html += `
      <div style="padding: 15px; background: #fffbeb; border-radius: 6px; margin-bottom: 10px;">
        <div style="font-size: 12px; font-weight: 600; color: #92400e; text-transform: uppercase; margin-bottom: 5px;">
          ${getCategoryLabel(insight.category)} — WARNING
        </div>
        <p style="margin: 0 0 8px 0; color: #1f2937;">${insight.message}</p>
        ${insight.recommendation ? `<p style="margin: 0; color: #4b5563; font-size: 14px;"><strong>Recommendation:</strong> ${insight.recommendation}</p>` : ""}
      </div>
      `;
      }

      html += `</div>`;
    }
  }

  // Info Insights
  if (info.length > 0 && totalAlerts === 0) {
    html += `
    <div style="background: white; padding: 20px; border-radius: 8px; border-left: 4px solid #3b82f6;">
      <h2 style="margin: 0 0 15px 0; color: #3b82f6; font-size: 18px;">ℹ️ Updates (${info.length})</h2>
    `;

    for (const insight of info.slice(0, 3)) {
      html += `
      <div style="padding: 15px; background: #eff6ff; border-radius: 6px; margin-bottom: 10px;">
        <p style="margin: 0; color: #1f2937;">${insight.message}</p>
      </div>
      `;
    }

    html += `</div>`;
  }

  html += `
    <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center;">
      <p style="margin: 0; color: #6b7280; font-size: 14px;">
        View all insights in your <a href="${supabaseUrl.replace("/rest/v1", "")}/owner/command-center" style="color: #667eea; text-decoration: none;">Owner Command Center</a>
      </p>
      <p style="margin: 10px 0 0 0; color: #9ca3af; font-size: 12px;">
        — SmartSend AI Intelligence Layer
      </p>
    </div>
  </div>
</body>
</html>
  `;

  return html;
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
    console.error("RESEND_API_KEY not configured");
    return { ok: false, error: "RESEND_API_KEY not configured" };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [to],
        subject,
        html,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return { ok: false, error };
    }

    return { ok: true };
  } catch (e) {
    console.error("Error sending email via Resend:", e);
    return { ok: false, error: String(e) };
  }
}

Deno.serve(async () => {
  try {
    // 1) Get all workspaces with owners
    const workspaces = await getWorkspacesWithOwners();

    if (workspaces.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, processed: 0, message: "No workspaces found" }),
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

      // 2) Get AI insights for this workspace
      const insights = await getAIInsightsForWorkspace(workspaceId);

      // Only send if there are insights (or send empty state for now)
      // In production, you might want to always send or have a preference setting

      // 3) Build email body
      const html = buildEmailHtml(insights);

      // 4) Send email via Resend
      const emailResult = await sendEmailViaResend({
        to: ownerEmail,
        subject: "Good morning — here's your roofing intel for today.",
        html,
      });

      if (emailResult.ok) {
        processed++;
        console.log(`Sent AI digest to ${ownerEmail} for workspace ${workspaceId}`);
      } else {
        errors++;
        console.error(
          `Failed to send AI digest to ${ownerEmail} for workspace ${workspaceId}:`,
          emailResult.error
        );
      }
    }

    return new Response(
      JSON.stringify({ ok: true, processed, errors }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("ai-daily-digest error", e);
    return new Response(
      JSON.stringify({ ok: false, error: String(e) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});







































