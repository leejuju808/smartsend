// @ts-nocheck
// Provider-aware Send Worker with Gmail/Outlook support, retry/backoff, and logging
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID")!;
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET")!;
const MICROSOFT_CLIENT_ID = Deno.env.get("MICROSOFT_CLIENT_ID")!;
const MICROSOFT_CLIENT_SECRET = Deno.env.get("MICROSOFT_CLIENT_SECRET")!;
const MICROSOFT_REDIRECT_URI = Deno.env.get("MICROSOFT_OAUTH_REDIRECT_URL") || Deno.env.get("MICROSOFT_REDIRECT_URI")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// Helper: Check if job is due now
function dueNow(nextRunAt: string | null | undefined): boolean {
  if (!nextRunAt) return true;
  return new Date(nextRunAt) <= new Date();
}

// Helper: Calculate next retry time (exponential backoff)
function calculateNextRun(attempt: number): Date {
  // 30s, 2m, 5m, 15m, 1h
  const delays = [30, 120, 300, 900, 3600];
  const delaySeconds = delays[Math.min(attempt - 1, delays.length - 1)] || 3600;
  return new Date(Date.now() + delaySeconds * 1000);
}

// Refresh Gmail access token
async function refreshGmailToken(
  refreshToken: string
): Promise<{ access_token: string; expires_in: number }> {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gmail token refresh failed: ${text}`);
  }

  return res.json();
}

// Refresh Outlook access token
async function refreshOutlookToken(
  refreshToken: string
): Promise<{ access_token: string; expires_in: number }> {
  const params = new URLSearchParams({
    client_id: MICROSOFT_CLIENT_ID,
    client_secret: MICROSOFT_CLIENT_SECRET,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    redirect_uri: MICROSOFT_REDIRECT_URI,
  });

  const res = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Outlook token refresh failed: ${text}`);
  }

  return res.json();
}

// Ensure fresh access token for Gmail
async function ensureGmailAccessToken(
  userId: string
): Promise<string> {
  const { data: conn, error } = await supabase
    .from("user_connections")
    .select("*")
    .eq("user_id", userId)
    .eq("provider", "gmail")
    .maybeSingle();

  if (error || !conn) {
    throw new Error("No Gmail connection found");
  }

  if (!conn.refresh_token) {
    throw new Error("Missing Gmail refresh token");
  }

  // Check if token needs refresh (5 min buffer)
  const now = Date.now();
  const expiresAt = conn.expires_at ? new Date(conn.expires_at).getTime() : 0;

  if (conn.access_token && expiresAt && now < expiresAt - 5 * 60 * 1000) {
    return conn.access_token;
  }

  // Refresh token
  const tokens = await refreshGmailToken(conn.refresh_token);
  const newExpiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  await supabase
    .from("user_connections")
    .update({
      access_token: tokens.access_token,
      expires_at: newExpiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", conn.id);

  return tokens.access_token;
}

// Ensure fresh access token for Outlook
async function ensureOutlookAccessToken(
  userId: string
): Promise<string> {
  const { data: conn, error } = await supabase
    .from("user_connections")
    .select("*")
    .eq("user_id", userId)
    .eq("provider", "outlook")
    .maybeSingle();

  if (error || !conn) {
    throw new Error("No Outlook connection found");
  }

  if (!conn.refresh_token) {
    throw new Error("Missing Outlook refresh token");
  }

  // Check if token needs refresh (5 min buffer)
  const now = Date.now();
  const expiresAt = conn.expires_at ? new Date(conn.expires_at).getTime() : 0;

  if (conn.access_token && expiresAt && now < expiresAt - 5 * 60 * 1000) {
    return conn.access_token;
  }

  // Refresh token
  const tokens = await refreshOutlookToken(conn.refresh_token);
  const newExpiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  await supabase
    .from("user_connections")
    .update({
      access_token: tokens.access_token,
      expires_at: newExpiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", conn.id);

  return tokens.access_token;
}

// Build RFC822 message for Gmail
function buildRFC822(from: string, to: string, subject: string, html: string): string {
  const boundary = `----=_Part_${Math.random().toString(36).slice(2)}`;
  const raw = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: quoted-printable",
    "",
    subject.replace(/./g, ""), // Plain text fallback
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: quoted-printable",
    "",
    html,
    "",
    `--${boundary}--`,
  ].join("\r\n");

  return raw;
}

// Base64URL encode
function toBase64Url(input: string): string {
  const b64 = btoa(input);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Send via Gmail
async function sendViaGmail(
  accessToken: string,
  from: string,
  to: string,
  subject: string,
  html: string
): Promise<{ messageId: string; threadId: string | null }> {
  const raw = buildRFC822(from, to, subject, html);
  const b64url = toBase64Url(raw);

  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw: b64url }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gmail send failed: ${res.status} ${text}`);
  }

  const result = await res.json();
  return {
    messageId: result.id || "",
    threadId: result.threadId || null,
  };
}

// Send via Outlook
async function sendViaOutlook(
  accessToken: string,
  from: string,
  to: string,
  subject: string,
  html: string
): Promise<{ messageId: string; threadId: string | null }> {
  const body = {
    message: {
      subject,
      body: {
        contentType: "HTML",
        content: html,
      },
      toRecipients: [{ emailAddress: { address: to } }],
      from: { emailAddress: { address: from } },
    },
    saveToSentItems: true,
  };

  const res = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Outlook send failed: ${res.status} ${text}`);
  }

  // Outlook doesn't return message ID directly in sendMail response
  // We'd need to fetch it separately or use a different approach
  return {
    messageId: `outlook-${Date.now()}`,
    threadId: null,
  };
}

// Log send attempt
async function logSend(
  jobId: string,
  status: "sent" | "failed",
  message: string,
  provider?: string,
  messageId?: string,
  error?: string
): Promise<void> {
  await supabase.from("send_logs").insert({
    job_id: jobId,
    status,
    message,
    provider: provider || null,
    message_id: messageId || null,
    error: error || null,
    created_at: new Date().toISOString(),
  });
}

// Process a single job
async function processJob(job: any): Promise<void> {
  try {
    // Mark as processing
    await supabase
      .from("email_jobs")
      .update({
        status: "in_progress",
        locked_by: `worker-${Deno.env.get("DENO_DEPLOYMENT_ID") || "local"}`,
        locked_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    await logSend(job.id, "sent", "Starting send attempt", job.provider);

    if (job.campaign_id && job.lead_id) {
      const { data: guardData, error: guardError } = await supabase.rpc("should_send_to_lead", {
        p_campaign_id: job.campaign_id,
        p_lead_id: job.lead_id,
      });

      if (guardError) {
        console.warn("should_send_to_lead error", guardError);
      } else {
        const guardRow = Array.isArray(guardData) ? guardData?.[0] : guardData;
        if (guardRow && guardRow.allowed === false) {
          const guardReason: string = guardRow.reason ?? "ooo_recent_outbound_guard";
          const guardSnooze: string | null = guardRow.snooze_until ?? null;

          try {
            await supabase.rpc("safe_pause_followups", {
              p_campaign_id: job.campaign_id,
              p_lead_id: job.lead_id,
              p_reason: guardReason,
              p_snooze_until: guardSnooze,
            });
          } catch (pauseErr) {
            console.warn("safe_pause_followups error", pauseErr);
          }

          await supabase
            .from("delivery_events")
            .insert({
              campaign_id: job.campaign_id,
              lead_id: job.lead_id,
              thread_id: job.thread_id ?? null,
              step_id: job.step_id ?? null,
              type: "skip_due_to_ooo_guard",
              event: "skip_due_to_ooo_guard",
              meta: {
                reason: guardReason,
                snooze_until: guardSnooze,
              },
            })
            .catch((evtErr) => console.warn("delivery_events guard insert failed", evtErr));

          await supabase
            .from("email_jobs")
            .update({
              status: "failed",
              attempts: (job.attempts || 0) + 1,
              last_error: guardReason,
            })
            .eq("id", job.id);

          await logSend(job.id, "failed", "Skipped: outbound guard blocked send", job.provider, undefined, guardReason);
          return;
        }
      }
    }

    // Get user_id from workspace_id
    // Try workspace.owner_id first, then fall back to workspace_members
    const { data: workspace } = await supabase
      .from("workspaces")
      .select("owner_id")
      .eq("id", job.workspace_id)
      .maybeSingle();

    let userId: string | null = workspace?.owner_id || null;

    // If no owner_id, get from workspace_members
    if (!userId) {
      const { data: workspaceMember } = await supabase
        .from("workspace_members")
        .select("user_id, role")
        .eq("workspace_id", job.workspace_id)
        .order("role", { ascending: true }) // owner first, then admin, etc.
        .limit(1)
        .maybeSingle();

      if (!workspaceMember) {
        throw new Error(`No owner or members found for workspace ${job.workspace_id}`);
      }

      userId = workspaceMember.user_id;
    }

    // Get user connection based on provider
    let accessToken: string;
    let fromEmail: string;

    if (job.provider === "gmail") {
      accessToken = await ensureGmailAccessToken(userId);
      // Get from email from connection
      const { data: conn } = await supabase
        .from("user_connections")
        .select("email_address")
        .eq("user_id", userId)
        .eq("provider", "gmail")
        .maybeSingle();
      fromEmail = conn?.email_address || job.to_email.split("@")[0] + "@gmail.com";
    } else if (job.provider === "outlook") {
      accessToken = await ensureOutlookAccessToken(userId);
      // Get from email from connection
      const { data: conn } = await supabase
        .from("user_connections")
        .select("email_address")
        .eq("user_id", userId)
        .eq("provider", "outlook")
        .maybeSingle();
      fromEmail = conn?.email_address || job.to_email.split("@")[0] + "@outlook.com";
    } else {
      throw new Error(`Unsupported provider: ${job.provider}`);
    }

    // Send email
    let result: { messageId: string; threadId: string | null };

    if (job.provider === "gmail") {
      result = await sendViaGmail(accessToken, fromEmail, job.to_email, job.subject, job.body_html);
    } else {
      result = await sendViaOutlook(accessToken, fromEmail, job.to_email, job.subject, job.body_html);
    }

    // Success
    await Promise.all([
      supabase
        .from("email_jobs")
        .update({
          status: "sent",
          attempts: job.attempts + 1,
          last_error: null,
        })
        .eq("id", job.id),
      logSend(job.id, "sent", "Email sent successfully", job.provider, result.messageId),
    ]);
  } catch (error: any) {
    const errorMsg = error?.message || "Unknown error";
    const nextAttempt = (job.attempts || 0) + 1;
    const maxAttempts = job.max_attempts || 5;

    await logSend(job.id, "failed", `Send failed: ${errorMsg}`, job.provider, undefined, errorMsg);

    if (nextAttempt >= maxAttempts) {
      // Max attempts reached - mark as failed
      await supabase
        .from("email_jobs")
        .update({
          status: "failed",
          attempts: nextAttempt,
          last_error: errorMsg,
        })
        .eq("id", job.id);
    } else {
      // Schedule retry with exponential backoff
      const nextRunAt = calculateNextRun(nextAttempt);

      await supabase
        .from("email_jobs")
        .update({
          status: "queued",
          attempts: nextAttempt,
          last_error: errorMsg,
          scheduled_for: nextRunAt.toISOString(), // Use scheduled_for if next_run_at doesn't exist
          next_run_at: nextRunAt.toISOString(), // Try next_run_at field
        })
        .eq("id", job.id);
    }
  }
}

// Main batch processing function
async function runBatch(): Promise<{ processed: number }> {
  // Get jobs that are due (using scheduled_for or next_run_at)
  const { data: jobs, error } = await supabase
    .from("email_jobs")
    .select("*")
    .eq("status", "queued")
    .or("scheduled_for.lte." + new Date().toISOString() + ",next_run_at.lte." + new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(50);

  if (error) {
    console.error("Error fetching jobs:", error);
    throw error;
  }

  if (!jobs || jobs.length === 0) {
    return { processed: 0 };
  }

  // Filter jobs that are actually due
  const due = (jobs || []).filter((j: any) => {
    const nextRun = j.next_run_at || j.scheduled_for;
    return dueNow(nextRun);
  });

  if (due.length === 0) {
    return { processed: 0 };
  }

  // Process jobs sequentially to avoid rate limits
  for (const job of due) {
    await processJob(job);
  }

  return { processed: due.length };
}

// Deno.serve handler
Deno.serve(async (req) => {
  if (req.method === "POST") {
    try {
      const out = await runBatch();
      return new Response(JSON.stringify(out), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (error: any) {
      console.error("Send worker error:", error);
      return new Response(
        JSON.stringify({ error: error?.message || "Unknown error" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  }

  return new Response("Use POST to run", { status: 405 });
});