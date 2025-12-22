// supabase/functions/gmail-send/index.ts
// Gmail Send Edge Function - Uses stored OAuth tokens with auto-refresh

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID")!;
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Base64url encoding helper
function base64url(input: string): string {
  const b64 = btoa(input);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Build HTML MIME message
function buildHtmlMime(fromEmail: string, toEmail: string, subject: string, html: string): string {
  const msg = [
    `From: ${fromEmail}`,
    `To: ${toEmail}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset="UTF-8"',
    '',
    html
  ].join('\r\n');

  return base64url(msg);
}

// Refresh Google OAuth token
async function refreshToken(refresh_token: string): Promise<{ access_token: string; expires_in: number }> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token,
    }),
  });

  if (!res.ok) {
    throw new Error(`Token refresh failed: ${res.status} ${await res.text()}`);
  }

  return await res.json();
}

// Get or refresh access token for org_id
async function getAccessToken(org_id: string): Promise<string> {
  // Get oauth_connection for this org (find by org_id)
  const { data: conn, error } = await supabase
    .from("oauth_connections")
    .select("*")
    .eq("org_id", org_id)
    .eq("provider", "google")
    .maybeSingle();

  if (error || !conn) {
    throw new Error(`No Gmail connection found for org ${org_id}`);
  }

  // Check if token is still valid (5 min buffer)
  const expiresAt = conn.expires_at ? new Date(conn.expires_at) : new Date(0);
  const now = new Date();
  const buffer = 5 * 60 * 1000; // 5 minutes

  if (expiresAt > new Date(now.getTime() + buffer)) {
    return conn.access_token;
  }

  // Refresh token
  console.log(`Refreshing token for org ${org_id}`);
  const tokens = await refreshToken(conn.refresh_token);
  
  // Update stored token
  const newExpiresAt = new Date(now.getTime() + tokens.expires_in * 1000).toISOString();
  await supabase
    .from("oauth_connections")
    .update({
      access_token: tokens.access_token,
      expires_at: newExpiresAt,
      updated_at: now.toISOString(),
    })
    .eq("id", conn.id);

  return tokens.access_token;
}

// Send email via Gmail API
async function sendViaGmail(access_token: string, rawMessage: string): Promise<{ id: string; threadId?: string }> {
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw: rawMessage }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Gmail API error: ${res.status} ${errorText}`);
  }

  const result = await res.json();
  return {
    id: result.id || "",
    threadId: result.threadId || undefined,
  };
}

Deno.serve(async (req) => {
  try {
    const { org_id, from_email, to_email, subject, html } = await req.json() as {
      org_id: string;
      from_email: string;
      to_email: string;
      subject: string;
      html: string;
    };

    if (!org_id || !from_email || !to_email || !subject || !html) {
      return new Response(JSON.stringify({ ok: false, error: "Missing required fields" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Get or refresh access token
    const access_token = await getAccessToken(org_id);

    // Build MIME message
    const rawMessage = buildHtmlMime(from_email, to_email, subject, html);

    // Send via Gmail API
    const result = await sendViaGmail(access_token, rawMessage);

    return new Response(JSON.stringify({ ok: true, id: result.id, threadId: result.threadId }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("gmail-send error:", e);
    return new Response(JSON.stringify({ ok: false, error: e?.message || String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

