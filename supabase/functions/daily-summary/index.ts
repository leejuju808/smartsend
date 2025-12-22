// supabase/functions/daily-summary/index.ts
// Block 16200 — Daily Summary Email Cron
// Runs once every morning (e.g., 7:00 AM) to send daily summaries to workspace owners

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// Send email via SendGrid
async function sendEmailViaSendGrid({
  to,
  subject,
  text,
}: {
  to: string;
  subject: string;
  text: string;
}) {
  const sendgridKey = Deno.env.get("SENDGRID_API_KEY");
  if (!sendgridKey) {
    console.warn("SENDGRID_API_KEY not set — skipping email send");
    return { ok: false, skipped: true };
  }

  const fromEmail = Deno.env.get("SMARTSEND_FROM") || "noreply@smartsendhq.com";

  try {
    const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sendgridKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: fromEmail },
        subject,
        content: [
          {
            type: "text/plain",
            value: text,
          },
        ],
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("SendGrid error:", text);
      return { ok: false, error: text };
    }

    return { ok: true };
  } catch (e) {
    console.error("SendGrid send error:", e);
    return { ok: false, error: String(e) };
  }
}

Deno.serve(async (req) => {
  try {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Load all workspaces that want daily summaries
    const { data: workspaces, error: wsError } = await supabase
      .from("workspaces")
      .select("id, notification_settings, plan_key")
      .not("notification_settings", "is", null);

    if (wsError) {
      console.error("Error loading workspaces:", wsError);
      return new Response(
        JSON.stringify({ ok: false, error: wsError.message }),
        { status: 500 }
      );
    }

    if (!workspaces || workspaces.length === 0) {
      return new Response(JSON.stringify({ ok: true, processed: 0 }), {
        status: 200,
      });
    }

    let processed = 0;

    for (const ws of workspaces) {
      const settings = ws.notification_settings || {};
      if (!settings.daily_summary_email) continue;

      const workspaceId = ws.id;

      // Load owner
      const { data: ownerMember, error: ownerError } = await supabase
        .from("workspace_members")
        .select("user_id")
        .eq("workspace_id", workspaceId)
        .eq("role", "owner")
        .maybeSingle();

      if (ownerError || !ownerMember?.user_id) {
        console.error(
          `No owner found for workspace ${workspaceId}:`,
          ownerError
        );
        continue;
      }

      // Get owner email using admin API
      const { data: ownerUser } = await supabase.auth.admin.getUserById(ownerMember.user_id);
      const ownerEmail = ownerUser?.user?.email;
      
      if (!ownerEmail) {
        console.error(`No email found for owner ${ownerMember.user_id}`);
        continue;
      }

      // Stats yesterday
      const { data: emailStats, error: emailError } = await supabase
        .from("email_messages")
        .select("id, opened_at, replied_at")
        .eq("workspace_id", workspaceId)
        .eq("status", "sent")
        .gte("created_at", yesterday.toISOString())
        .lt("created_at", now.toISOString());

      if (emailError) {
        console.error(`Error loading email stats for ${workspaceId}:`, emailError);
        continue;
      }

      const sent = emailStats?.length || 0;
      const opens = emailStats?.filter((m) => m.opened_at).length || 0;
      const replies = emailStats?.filter((m) => m.replied_at).length || 0;

      // Hot / warm in last 24h
      const { data: hotWarm, error: hotWarmError } = await supabase
        .from("contacts")
        .select("lead_status, est_job_value")
        .eq("workspace_id", workspaceId)
        .in("lead_status", ["hot", "warm"])
        .gte("updated_at", yesterday.toISOString())
        .lt("updated_at", now.toISOString());

      if (hotWarmError) {
        console.error(`Error loading hot/warm leads for ${workspaceId}:`, hotWarmError);
        continue;
      }

      const hot = hotWarm?.filter((c) => c.lead_status === "hot").length || 0;
      const warm =
        hotWarm?.filter((c) => c.lead_status === "warm").length || 0;

      const estValue =
        hotWarm?.reduce(
          (sum, c) => sum + (Number(c.est_job_value || 0) || 0),
          0
        ) || 0;

      // Follow-ups today
      const startOfDay = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate()
      );
      const endOfDay = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1
      );

      const { data: tasksToday, error: tasksError } = await supabase
        .from("tasks")
        .select("title, due_at, contacts(first_name,last_name,email,city)")
        .eq("workspace_id", workspaceId)
        .eq("status", "open")
        .gte("due_at", startOfDay.toISOString())
        .lt("due_at", endOfDay.toISOString())
        .order("due_at", { ascending: true })
        .limit(10);

      if (tasksError) {
        console.error(`Error loading tasks for ${workspaceId}:`, tasksError);
        continue;
      }

      const lines: string[] = [];

      lines.push(`SmartSend Daily Summary`);
      lines.push(`Date: ${startOfDay.toDateString()}`);
      lines.push("");
      lines.push(`Yesterday's outreach:`);
      lines.push(`- Emails sent:   ${sent}`);
      lines.push(`- Opens:         ${opens}`);
      lines.push(`- Replies:       ${replies}`);
      lines.push(`- New hot leads: ${hot}`);
      lines.push(`- New warm leads:${warm}`);
      lines.push(
        `- Est. value in new hot/warm leads: $${estValue.toLocaleString()}`
      );
      lines.push("");
      lines.push(`Today's follow-ups:`);
      if (!tasksToday || tasksToday.length === 0) {
        lines.push("- None scheduled.");
      } else {
        tasksToday.forEach((t) => {
          const contact = t.contacts;
          const name =
            contact?.first_name || contact?.last_name
              ? `${contact?.first_name || ""} ${
                  contact?.last_name || ""
                }`.trim()
              : contact?.email || "Unknown";
          const when = new Date(t.due_at).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          });
          lines.push(`- ${when} → ${name} · ${t.title}`);
        });
      }

      lines.push("");
      const siteUrl = Deno.env.get("NEXT_PUBLIC_SITE_URL") || "https://app.smartsendhq.com";
      lines.push("Open SmartSend to work your leads:");
      lines.push(`- Dashboard: ${siteUrl}/dashboard`);
      lines.push(`- Inbox:     ${siteUrl}/inbox`);
      lines.push(`- Pipeline:  ${siteUrl}/pipeline`);

      const emailResult = await sendEmailViaSendGrid({
        to: ownerEmail,
        subject: "SmartSend Daily Summary",
        text: lines.join("\n"),
      });

      if (emailResult.ok) {
        await supabase.from("notification_logs").insert({
          workspace_id: workspaceId,
          type: "daily_summary",
          meta: { date: startOfDay.toISOString() },
        });
        processed++;
      } else {
        console.error(`Failed to send daily summary to ${ownerEmail}:`, emailResult.error);
      }
    }

    return new Response(
      JSON.stringify({ ok: true, processed }),
      { status: 200 }
    );
  } catch (err) {
    console.error("Unhandled error in daily-summary:", err);
    return new Response(
      JSON.stringify({ ok: false, error: String(err) }),
      { status: 500 }
    );
  }
});

