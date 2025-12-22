import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("NEXT_PUBLIC_SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

const JSON_HEADERS = { "content-type": "application/json" };

type ApprovePayload = {
  action: "approve" | "reject";
  pending_id: string;
  // optional editor override
  subject?: string;
  body?: string;
};

// Helper: Get Gmail access token for a user
async function getGmailAccessToken(userId: string): Promise<string | null> {
  const { data: cred } = await supabase
    .from("email_credentials")
    .select("access_token, refresh_token, expires_at")
    .eq("user_id", userId)
    .eq("provider", "gmail")
    .maybeSingle();

  if (!cred) return null;

  let accessToken = cred.access_token as string;
  const expiresAt = new Date(cred.expires_at as string).getTime();

  // Refresh if expiring soon
  if (expiresAt - Date.now() < 60_000) {
    const refreshed = await refreshGoogleToken(cred.refresh_token as string);
    accessToken = refreshed.access_token;

    // Update in DB
    await supabase
      .from("email_credentials")
      .update({
        access_token: refreshed.access_token,
        expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
      })
      .eq("user_id", userId)
      .eq("provider", "gmail");
  }

  return accessToken;
}

async function refreshGoogleToken(refreshToken: string): Promise<{
  access_token: string;
  expires_in: number;
  refresh_token?: string;
}> {
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");

  if (!clientId || !clientSecret) {
    throw new Error("Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET");
  }

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!resp.ok) {
    throw new Error(`Token refresh failed: ${await resp.text()}`);
  }

  return await resp.json();
}

// Helper: Send email via Gmail API
async function sendGmailEmail(
  accessToken: string,
  fromEmail: string,
  toEmail: string,
  subject: string,
  bodyText: string,
  threadId?: string
): Promise<{ messageId: string; threadId: string }> {
  const boundary = "smartsend_" + crypto.randomUUID().slice(0, 8);
  const headers = [
    `From: ${fromEmail}`,
    `To: ${toEmail}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ].join("\r\n");

  const body = `--${boundary}
Content-Type: text/plain; charset="UTF-8"

${bodyText}

--${boundary}--`;

  const raw = btoa(`${headers}\r\n\r\n${body}`)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

  const payload: Record<string, unknown> = { raw };
  if (threadId) payload.threadId = threadId;

  const resp = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Gmail send failed: ${txt}`);
  }

  const data = await resp.json();
  return { messageId: data.id, threadId: data.threadId || threadId || "" };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const payload = (await req.json()) as ApprovePayload;
    const { action, pending_id, subject, body } = payload;

    // Fetch pending action with related data
    const { data: pending, error: pendingErr } = await supabase
      .from("ai_sdr_pending_actions")
      .select(`
        *,
        leads!inner(id, email, user_id),
        ai_sdr_threads!inner(id),
        campaigns(id, subject)
      `)
      .eq("id", pending_id)
      .single();

    if (pendingErr || !pending) {
      console.error("Pending not found", pendingErr);
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: JSON_HEADERS,
      });
    }

    const userId = (pending.leads as any).user_id;
    const leadEmail = (pending.leads as any).email;
    const threadId = (pending.ai_sdr_threads as any).id;

    if (action === "reject") {
      await supabase
        .from("ai_sdr_pending_actions")
        .update({ status: "rejected", updated_at: new Date().toISOString() })
        .eq("id", pending_id);

      await supabase.from("ai_sdr_events").insert({
        thread_id: threadId,
        event_type: "review_rejected",
        details: { action_type: pending.action_type },
      });

      return new Response(JSON.stringify({ ok: true, message: "Rejected" }), {
        status: 200,
        headers: JSON_HEADERS,
      });
    }

    // APPROVE
    const finalSubject = subject ?? pending.suggested_subject ?? "Quick follow-up";
    const finalBody = body ?? pending.suggested_body ?? "";

    // Get Gmail access token
    const accessToken = await getGmailAccessToken(userId);
    if (!accessToken) {
      return new Response(
        JSON.stringify({ error: "No Gmail credentials found" }),
        { status: 400, headers: JSON_HEADERS }
      );
    }

    // Get sender email from campaign or user's email account
    const { data: emailCred } = await supabase
      .from("email_credentials")
      .select("email_address")
      .eq("user_id", userId)
      .eq("provider", "gmail")
      .maybeSingle();

    const fromEmail =
      emailCred?.email_address ||
      ((pending.campaigns as any)?.from_email as string) ||
      "noreply@smartsend.ai";

    // Get thread ID from thread if available
    const { data: threadData } = await supabase
      .from("ai_sdr_threads")
      .select("id")
      .eq("id", threadId)
      .single();

    // Get last message thread_id if available
    const { data: lastEmail } = await supabase
      .from("emails")
      .select("thread_id")
      .eq("lead_id", pending.lead_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const emailThreadId = lastEmail?.thread_id || null;

    // Send email via Gmail API
    try {
      const sendResult = await sendGmailEmail(
        accessToken,
        fromEmail,
        leadEmail,
        finalSubject,
        finalBody,
        emailThreadId || undefined
      );

      // Record email in emails table
      await supabase.from("emails").insert({
        lead_id: pending.lead_id,
        campaign_id: pending.campaign_id,
        subject: finalSubject,
        body_text: finalBody,
        is_incoming: false,
        user_id: userId,
        thread_id: sendResult.threadId || emailThreadId,
      });

      // Mark as sent + log event + update thread
      await supabase
        .from("ai_sdr_pending_actions")
        .update({
          status: "sent",
          updated_at: new Date().toISOString(),
        })
        .eq("id", pending_id);

      await supabase.from("ai_sdr_events").insert({
        thread_id: threadId,
        event_type: pending.action_type,
        details: {
          from_review: true,
          subject: finalSubject,
          body: finalBody,
        },
      });

      const now = new Date().toISOString();
      await supabase
        .from("ai_sdr_threads")
        .update({
          last_message_from: "me",
          last_message_at: now,
          status: "awaiting_reply",
          next_action_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(), // 48 hours
        })
        .eq("id", threadId);

      return new Response(
        JSON.stringify({ ok: true, message: "Approved & sent", threadId: sendResult.threadId }),
        { status: 200, headers: JSON_HEADERS }
      );
    } catch (e) {
      console.error("Send failed", e);
      return new Response(
        JSON.stringify({ error: `Send failed: ${e instanceof Error ? e.message : String(e)}` }),
        { status: 500, headers: JSON_HEADERS }
      );
    }
  } catch (error) {
    console.error("Review error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: JSON_HEADERS }
    );
  }
});


