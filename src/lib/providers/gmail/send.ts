import { refreshAccessToken } from "@/lib/providers/google/oauth";
import { getServerSupabase } from "@/lib/supabase/server";
import { buildUnsubHeaders } from "@/lib/unsub";

function buildRawRFC822({
  from,
  to,
  subject,
  html,
  extraHeaders
}: {
  from: string;
  to: string;
  subject: string;
  html: string;
  extraHeaders?: Record<string, string>;
}) {
  const boundary = "mixed_" + Math.random().toString(36).slice(2);
  
  const headers: string[] = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
  ];

  if (extraHeaders) {
    for (const [key, value] of Object.entries(extraHeaders)) {
      headers.push(`${key}: ${value}`);
    }
  }

  headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
  headers.push("");
  
  const head = [
    ...headers,
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(html, "utf8").toString("base64"),
    `--${boundary}--`
  ].join("\r\n");
  return Buffer.from(head).toString("base64url");
}

export async function gmailSendThroughWorkspace(
  workspace_id: string,
  {
    to,
    subject,
    html,
    org_id,
    campaignId
  }: {
    to: string;
    subject: string;
    html: string;
    org_id?: string;
    campaignId?: string | null;
  }
) {
  const supabase = getServerSupabase();
  
  // Check suppression before sending
  const orgId = org_id || workspace_id;
  const { data: blocked } = await supabase.rpc('is_suppressed', { 
    p_email: to.toLowerCase(), 
    p_org: orgId 
  });
  
  if (blocked) {
    throw new Error(`Email suppressed: ${to}`);
  }

  // Get connection
  const { data: conn } = await supabase
    .from("email_connections")
    .select("*")
    .eq("workspace_id", workspace_id)
    .eq("provider", "gmail")
    .eq("status", "active")
    .maybeSingle();

  if (!conn) throw new Error("No active Gmail connection");

  // Refresh if needed
  let access = conn.access_token;
  if (new Date(conn.access_token_expires_at).getTime() - Date.now() < 60_000) {
    const r = await refreshAccessToken({
      refreshToken: conn.refresh_token,
      clientId: process.env.GOOGLE_OAUTH_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!
    });
    access = r.access_token;
    await supabase.from("email_connections").update({
      access_token: r.access_token,
      access_token_expires_at: new Date(Date.now() + r.expires_in * 1000).toISOString()
    }).eq("id", conn.id);
  }

  const extraHeaders = campaignId ? buildUnsubHeaders(campaignId, to) : undefined;

  const raw = buildRawRFC822({
    from: conn.email_address,
    to,
    subject,
    html,
    extraHeaders
  });
  
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw })
  });
  if (!res.ok) throw new Error(`gmail send failed: ${res.status}`);
  return res.json();
}