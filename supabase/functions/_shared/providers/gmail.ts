import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// Google OAuth app creds (from your Google Cloud project)
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID")!;
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET")!;

type SendArgs = {
  from_user_id: string;
  to: string;
  subject: string;
  html: string;
};

export async function gmailSend(args: SendArgs): Promise<{ threadId?: string; messageId?: string }> {
  const { from_user_id, to, subject, html } = args;

  // 1) lookup credentials
  const { data: cred, error } = await supabase
    .from("email_credentials")
    .select("id, email_address, access_token, refresh_token, expires_at")
    .eq("user_id", from_user_id)
    .eq("provider", "gmail")
    .maybeSingle();
  if (error || !cred) throw new Error("gmail_account_not_connected");

  // 2) ensure valid access token
  let accessToken = cred.access_token as string;
  if (new Date(cred.expires_at as string).getTime() - Date.now() < 60_000) {
    const refreshed = await refreshGoogleToken(cred.refresh_token as string);
    accessToken = refreshed.access_token;

    // persist refresh
    await supabase.from("email_credentials").update({
      access_token: refreshed.access_token,
      expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
      ...(refreshed.refresh_token ? { refresh_token: refreshed.refresh_token } : {})
    }).eq("id", cred.id as string);
  }

  // 3) build RFC822 raw email (base64url)
  const raw = buildRfc822({
    from: cred.email_address as string,
    to,
    subject,
    html
  });

  // 4) call Gmail API
  const resp = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ raw })
  });

  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`gmail_send_failed: ${txt}`);
  }
  const data = await resp.json();

  return { threadId: data.threadId, messageId: data.id };
}

/** -------- helpers -------- */

async function refreshGoogleToken(refresh_token: string): Promise<{
  access_token: string; expires_in: number; refresh_token?: string;
}> {
  const p = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    grant_type: "refresh_token",
    refresh_token
  });
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: p.toString()
  });
  if (!r.ok) throw new Error(`token_refresh_failed: ${await r.text()}`);
  return await r.json();
}

function base64UrlEncode(str: string) {
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function buildRfc822(params: { from: string; to: string; subject: string; html: string; }) {
  const boundary = "smartsend_" + cryptoRandomSuffix();
  const headers = [
    `From: ${params.from}`,
    `To: ${params.to}`,
    `Subject: ${params.subject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`
  ].join("\r\n");

  const textFallback = stripHtml(params.html).slice(0, 10000);

  const body =
`--${boundary}
Content-Type: text/plain; charset="UTF-8"

${textFallback}


--${boundary}
Content-Type: text/html; charset="UTF-8"

${params.html}


--${boundary}--`;

  return base64UrlEncode(`${headers}\r\n\r\n${body}`);
}

function stripHtml(html: string) { return html.replace(/<[^>]*>/g, " "); }
function cryptoRandomSuffix() {
  const a = new Uint8Array(6); crypto.getRandomValues(a);
  return Array.from(a).map(b => b.toString(16).padStart(2, "0")).join("");
}
