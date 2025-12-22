// supabase/functions/weekly-hot-jobs-summary/index.ts
// Block 21388 — SmartSend Weekly Roofing Hot Jobs Email Summary

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

const resendApiKey = Deno.env.get("RESEND_API_KEY")!;
const fromEmail = Deno.env.get("HOT_JOBS_FROM_EMAIL") || "SmartSend <no-reply@smartsend.ai>";

type OrgRow = {
  id: string;
  name: string | null;
};

type OrgNotificationSettingsRow = {
  org_id: string;
  weekly_hot_jobs_enabled: boolean;
  weekly_hot_jobs_email: string | null;
};

type HotJobRow = {
  job_id: string;
  homeowner_name: string | null;
  homeowner_email: string | null;
  latest_score: number | null;
  score_bucket: string | null;
  last_calculated_at: string | null;
  created_at: string;
};

async function getOrgsWithWeeklyEnabled(): Promise<
  (OrgRow & { notification: OrgNotificationSettingsRow | null })[]
> {
  const { data: orgs, error } = await supabase.from("organizations").select("id, name");
  if (error || !orgs) {
    console.error("Failed to fetch organizations", error);
    return [];
  }

  const { data: settings } = await supabase
    .from("organization_notification_settings")
    .select("*");

  const settingsByOrg: Record<string, OrgNotificationSettingsRow> = {};
  (settings || []).forEach((s) => {
    settingsByOrg[s.org_id] = s;
  });

  return orgs
    .map((o) => ({
      ...o,
      notification: settingsByOrg[o.id] || null,
    }))
    .filter(
      (row) =>
        !row.notification || row.notification.weekly_hot_jobs_enabled === true
    );
}

async function getOrgOwnerEmail(orgId: string): Promise<string | null> {
  // First try to get from organizations.created_by
  const { data: org } = await supabase
    .from("organizations")
    .select("created_by")
    .eq("id", orgId)
    .single();

  if (org?.created_by) {
    const { data: { user } } = await supabase.auth.admin.getUserById(org.created_by);
    if (user?.email) {
      return user.email;
    }
  }

  // Fallback: get first admin/owner from org_members
  const { data: members } = await supabase
    .from("org_members")
    .select("user_id, role")
    .eq("org_id", orgId)
    .in("role", ["admin", "owner"])
    .order("role", { ascending: true }) // owner sorts before admin
    .limit(1);

  if (members && members.length > 0) {
    const { data: { user } } = await supabase.auth.admin.getUserById(members[0].user_id);
    if (user?.email) {
      return user.email;
    }
  }

  return null;
}

async function getHotJobsLast7Days(orgId: string): Promise<HotJobRow[]> {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const { data, error } = await supabase
    .from("roofing_jobs_with_health")
    .select(
      "job_id, homeowner_name, homeowner_email, latest_score, score_bucket, last_calculated_at, created_at"
    )
    .eq("org_id", orgId)
    .eq("score_bucket", "hot")
    .gte("last_calculated_at", sevenDaysAgo.toISOString())
    .order("latest_score", { ascending: false });

  if (error || !data) {
    console.error("Failed to fetch hot jobs for weekly summary", error);
    return [];
  }

  return data as HotJobRow[];
}

function buildEmailHtml(
  orgName: string | null,
  hotJobs: HotJobRow[]
): { subject: string; html: string } {
  const now = new Date();
  const weekLabel = now.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  const safeName = orgName || "your roofing company";

  const subject = `Your SmartSend Hot Roofing Jobs — Week of ${weekLabel}`;

  if (!hotJobs.length) {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #000; color: #fff; padding: 20px; border-radius: 8px 8px 0 0; }
          .content { background: #fff; padding: 30px; border: 1px solid #e5e5e5; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2>SmartSend Weekly Hot Jobs Summary</h2>
          </div>
          <div class="content">
            <p>Hi,</p>
            <p>This week SmartSend didn't detect any HOT roofing jobs (score ≥ 75).</p>
            <p>Send another campaign or follow-up to warm up new homeowners and create more opportunities.</p>
          </div>
        </div>
      </body>
      </html>
    `;
    return { subject, html };
  }

  const rowsHtml = hotJobs
    .slice(0, 10)
    .map((job) => {
      const score = job.latest_score ?? 0;
      return `
        <tr>
          <td style="padding: 4px 8px; border-bottom: 1px solid #e5e5e5;">
            ${job.homeowner_name || "Unknown homeowner"}
          </td>
          <td style="padding: 4px 8px; border-bottom: 1px solid #e5e5e5;">
            ${job.homeowner_email || ""}
          </td>
          <td style="padding: 4px 8px; border-bottom: 1px solid #e5e5e5; text-align: center;">
            ${score}
          </td>
          <td style="padding: 4px 8px; border-bottom: 1px solid #e5e5e5;">
            ${job.last_calculated_at ? new Date(job.last_calculated_at).toLocaleString() : ""}
          </td>
        </tr>
      `;
    })
    .join("");

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #000; color: #fff; padding: 20px; border-radius: 8px 8px 0 0; }
        .content { background: #fff; padding: 30px; border: 1px solid #e5e5e5; }
        table { border-collapse: collapse; font-size: 14px; margin-top: 12px; min-width: 480px; }
        th { text-align: left; padding: 4px 8px; border-bottom: 1px solid #ccc; font-weight: 600; }
        td { padding: 4px 8px; border-bottom: 1px solid #e5e5e5; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h2>SmartSend Weekly Hot Jobs Summary</h2>
        </div>
        <div class="content">
          <p>Hi,</p>
          <p>Here are your hottest roofing jobs for <strong>${safeName}</strong> this week.</p>
          <p>These homeowners have the highest Health Scores. Call or follow up with them first to book more estimates.</p>

          <table>
            <thead>
              <tr>
                <th>Homeowner</th>
                <th>Email</th>
                <th style="text-align: center;">Health Score</th>
                <th>Last Activity</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>

          <p style="margin-top: 16px; font-size: 13px; color: #555;">
            Tip: Log into SmartSend to see the full story behind each job — opens, clicks, replies, and follow-ups —
            so you know exactly what to say when you call.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;

  return { subject, html };
}

Deno.serve(async (req) => {
  // Optional: protect with a secret if you're calling this via cron URL
  const url = new URL(req.url);
  const authKey = url.searchParams.get("key");
  const expectedKey = Deno.env.get("CRON_SECRET");

  if (!authKey || authKey !== expectedKey) {
    return new Response("Unauthorized", { status: 401 });
  }

  const orgs = await getOrgsWithWeeklyEnabled();

  let processed = 0;
  let errors = 0;

  for (const org of orgs) {
    const orgId = org.id;

    const settings = org.notification;
    const hotJobs = await getHotJobsLast7Days(orgId);

    // Decide where to send
    let toEmail = settings?.weekly_hot_jobs_email || null;
    if (!toEmail) {
      toEmail = await getOrgOwnerEmail(orgId);
    }

    if (!toEmail) {
      console.warn(`No email for org ${orgId}, skipping weekly hot jobs email`);
      continue;
    }

    const { subject, html } = buildEmailHtml(org.name, hotJobs);

    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromEmail,
          to: toEmail,
          subject,
          html,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Failed to send weekly hot jobs email to ${toEmail} for org ${orgId}:`, errorText);
        errors++;
        continue;
      }

      console.log("Sent weekly hot jobs email to", toEmail, "for org", orgId);
      processed++;
    } catch (err) {
      console.error("Failed to send weekly hot jobs email", err);
      errors++;
    }
  }

  return new Response(
    JSON.stringify({ ok: true, processed, errors }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});

