// supabase/functions/daily_summary_email/index.ts
// Block 21435 — SmartSend Daily Roofing Owner Summary Email v1
// Sends daily summary at 7:00 AM local roofer time

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
  html,
}: {
  to: string;
  subject: string;
  html: string;
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
            type: "text/html",
            value: html,
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

Deno.serve(async () => {
  try {
    // 1) Get all users from profiles
    const { data: users, error: userError } = await supabase
      .from("profiles")
      .select("id");

    if (userError) {
      console.error("User fetch error:", userError);
      return new Response("fail", { status: 500 });
    }

    if (!users || users.length === 0) {
      return new Response(JSON.stringify({ ok: true, processed: 0 }), {
        status: 200,
      });
    }

    // Today date (YYYY-MM-DD format)
    const today = new Date().toISOString().slice(0, 10);
    const todayStart = `${today}T00:00:00.000Z`;
    const todayEnd = `${today}T23:59:59.999Z`;

    let processed = 0;

    for (const user of users) {
      // Get user email from auth
      let userEmail: string | null = null;
      try {
        const { data: authUser } = await supabase.auth.admin.getUserById(user.id);
        userEmail = authUser?.user?.email || null;
      } catch (e) {
        console.error(`Failed to get email for user ${user.id}:`, e);
      }

      // Fallback to profiles table email
      if (!userEmail) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("email")
          .eq("id", user.id)
          .maybeSingle();
        userEmail = profile?.email || null;
      }

      if (!userEmail) {
        console.error(`No email found for user ${user.id}`);
        continue;
      }

      // 2) Fetch tasks for today (not completed)
      // Tasks are due today if due_at is between today 00:00 and 23:59
      // Handle both completed boolean and status field
      const { data: todayTasks, error: todayTasksError } = await supabase
        .from("tasks")
        .select("*")
        .eq("assigned_to", user.id)
        .or("completed.eq.false,status.eq.open,status.eq.pending")
        .gte("due_at", todayStart)
        .lte("due_at", todayEnd)
        .order("priority", { ascending: false });

      if (todayTasksError) {
        console.error(`Error fetching today's tasks for user ${user.id}:`, todayTasksError);
      }

      // Separate high priority and normal tasks
      const highPriorityTasks = (todayTasks || []).filter(
        (t) => t.priority === "high"
      );
      const normalTasks = (todayTasks || []).filter(
        (t) => t.priority !== "high"
      );

      // 3) Fetch overdue tasks (due_at < today, not completed)
      // Handle both completed boolean and status field
      const { data: overdueTasks, error: overdueError } = await supabase
        .from("tasks")
        .select("*")
        .eq("assigned_to", user.id)
        .lt("due_at", todayStart)
        .or("completed.eq.false,status.eq.open,status.eq.pending")
        .order("due_at", { ascending: true });

      if (overdueError) {
        console.error(`Error fetching overdue tasks for user ${user.id}:`, overdueError);
      }

      // 4) Fetch today's hot replies
      // Try to get hot replies from reply_intents table
      let hotReplies: any[] = [];
      try {
        const { data: hotRepliesData, error: hotRepliesError } = await supabase
          .from("reply_intents")
          .select("*, emails(*)")
          .eq("user_id", user.id)
          .eq("intent", "hot")
          .gte("created_at", todayStart)
          .lte("created_at", todayEnd);

        if (!hotRepliesError && hotRepliesData) {
          hotReplies = hotRepliesData;
        } else if (hotRepliesError) {
          console.error(`Error fetching hot replies for user ${user.id}:`, hotRepliesError);
        }
      } catch (e) {
        console.error(`Exception fetching hot replies for user ${user.id}:`, e);
      }

      // 5) Calculate estimated revenue from pipeline
      // Get contacts with hot/warm status and estimated values
      let estimatedRevenue = 0;
      try {
        // Try to get contacts via org_id or workspace_id
        // First, try to find user's org
        const { data: orgMember } = await supabase
          .from("org_members")
          .select("org_id")
          .eq("user_id", user.id)
          .limit(1)
          .maybeSingle();

        let orgId = orgMember?.org_id;

        // Fallback: try workspace_members
        if (!orgId) {
          const { data: workspaceMember } = await supabase
            .from("workspace_members")
            .select("workspace_id")
            .eq("user_id", user.id)
            .limit(1)
            .maybeSingle();
          
          orgId = workspaceMember?.workspace_id;
        }

        if (orgId) {
          // Try org_id first
          let { data: contacts, error: contactsError } = await supabase
            .from("contacts")
            .select("estimated_value_min, estimated_value_max, est_job_value, lead_status")
            .eq("org_id", orgId)
            .in("lead_status", ["hot", "warm"]);

          // If no results, try workspace_id
          if ((!contacts || contacts.length === 0) && !contactsError) {
            const result = await supabase
              .from("contacts")
              .select("estimated_value_min, estimated_value_max, est_job_value, lead_status")
              .eq("workspace_id", orgId)
              .in("lead_status", ["hot", "warm"]);
            contacts = result.data;
            contactsError = result.error;
          }

          if (!contactsError && contacts) {
            estimatedRevenue = contacts.reduce((sum, c) => {
              // Use average of min/max if available, otherwise use est_job_value
              if (c.estimated_value_min && c.estimated_value_max) {
                return sum + (Number(c.estimated_value_min) + Number(c.estimated_value_max)) / 2;
              } else if (c.estimated_value_min) {
                return sum + Number(c.estimated_value_min);
              } else if (c.est_job_value) {
                return sum + Number(c.est_job_value);
              }
              return sum;
            }, 0);
          }
        }
      } catch (e) {
        console.error(`Error calculating revenue for user ${user.id}:`, e);
      }

      // 6) Build summary email
      const emailHtml = buildSummaryEmail({
        todayTasks: todayTasks || [],
        highPriorityTasks,
        normalTasks,
        overdueTasks: overdueTasks || [],
        hotReplies: hotReplies || [],
        estimatedRevenue,
      });

      // 7) Send the email
      const emailResult = await sendEmailViaSendGrid({
        to: userEmail,
        subject: "Your SmartSend Daily Summary",
        html: emailHtml,
      });

      if (emailResult.ok) {
        processed++;
        console.log(`Sent daily summary to ${userEmail}`);
      } else {
        console.error(`Failed to send daily summary to ${userEmail}:`, emailResult.error);
      }
    }

    return new Response(
      JSON.stringify({ ok: true, processed }),
      { status: 200 }
    );
  } catch (err) {
    console.error("Unhandled error in daily_summary_email:", err);
    return new Response(
      JSON.stringify({ ok: false, error: String(err) }),
      { status: 500 }
    );
  }
});

// Email Template
function buildSummaryEmail({
  todayTasks,
  highPriorityTasks,
  normalTasks,
  overdueTasks,
  hotReplies,
  estimatedRevenue,
}: {
  todayTasks: any[];
  highPriorityTasks: any[];
  normalTasks: any[];
  overdueTasks: any[];
  hotReplies: any[];
  estimatedRevenue: number;
}) {
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
  <title>SmartSend Daily Summary</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="margin-bottom: 10px; color: #1a1a1a;">SmartSend Daily Summary</h2>
  
  <p style="font-size: 14px; color: #666;">
    Here's your roofing business overview for today:
  </p>

  <div style="margin-top: 30px;">
    <h3 style="font-family: Arial; margin-top: 20px; color: #d32f2f;">🔥 Hot Leads</h3>
    ${
      hotReplies.length === 0
        ? "<p style='color:#777;'>No hot leads today.</p>"
        : hotReplies
            .map((r) => {
              const email = r.emails || {};
              const fromEmail = email.from_email || email.from || "Unknown";
              return `<p style="margin: 8px 0;"><strong>${fromEmail}</strong> replied with high interest.</p>`;
            })
            .join("")
    }
  </div>

  <div style="margin-top: 30px;">
    <h3 style="font-family: Arial; margin-top: 20px; color: #1976d2;">📌 Tasks Due Today</h3>
    ${
      todayTasks.length === 0
        ? "<p style='color:#777;'>No tasks due today.</p>"
        : `
          ${highPriorityTasks.length > 0 ? `
            <h4 style="color: #d32f2f; font-size: 14px; margin-top: 15px;">High Priority</h4>
            ${highPriorityTasks
              .map(
                (t) =>
                  `<p style="margin: 8px 0;"><strong>${t.title}</strong>${t.notes ? ` — ${t.notes}` : ""}</p>`
              )
              .join("")}
          ` : ""}
          ${normalTasks.length > 0 ? `
            <h4 style="color: #666; font-size: 14px; margin-top: 15px;">Normal Priority</h4>
            ${normalTasks
              .map(
                (t) =>
                  `<p style="margin: 8px 0;"><strong>${t.title}</strong>${t.notes ? ` — ${t.notes}` : ""}</p>`
              )
              .join("")}
          ` : ""}
        `
    }
  </div>

  <div style="margin-top: 30px;">
    <h3 style="font-family: Arial; margin-top: 20px; color: #f57c00;">⚠️ Overdue Tasks</h3>
    ${
      overdueTasks.length === 0
        ? "<p style='color:#777;'>No overdue tasks.</p>"
        : overdueTasks
            .map((t) => {
              const dueDate = t.due_at || t.due_date;
              const formattedDate = dueDate
                ? new Date(dueDate).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })
                : "Unknown";
              return `<p style="margin: 8px 0;"><strong>${t.title}</strong> (was due ${formattedDate})</p>`;
            })
            .join("")
    }
  </div>

  <div style="margin-top: 30px;">
    <h3 style="font-family: Arial; margin-top: 20px; color: #388e3c;">💰 Estimated Revenue Opportunity</h3>
    <p style="font-size: 18px; font-weight: bold; color: #2e7d32;">
      ${formatCurrency(estimatedRevenue)}
    </p>
    <p style="font-size: 12px; color: #777; margin-top: 5px;">
      Total estimated job value in pipeline (from Job Health Score system)
    </p>
  </div>

  <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee;">
    <p style="font-size: 12px; color: #777;">
      SmartSend is working in the background to keep your roofing pipeline healthy and moving.
    </p>
  </div>
</body>
</html>
  `;
}

