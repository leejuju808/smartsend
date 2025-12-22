// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID")!;
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET")!;

type Conn = {
  id: string;
  user_id: string;
  access_token: string;
  refresh_token: string;
  token_expires_at: string;
  gmail_history_id: string | null;
};

// Simple fetch wrapper
async function gfetch(url: string, token: string) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Gmail fetch ${res.status}: ${await res.text()}`);
  return res.json();
}

// Refresh token if needed
async function ensureAccessToken(conn: Conn, supabase: any): Promise<string> {
  const expires = new Date(conn.token_expires_at).getTime();
  if (Date.now() < expires - 60_000) return conn.access_token;

  const body = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    refresh_token: conn.refresh_token,
    grant_type: "refresh_token",
  });
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", body });
  if (!r.ok) throw new Error(`Token refresh failed: ${await r.text()}`);
  const data = await r.json();
  const newAccess = data.access_token as string;
  const expiresIn = (data.expires_in ?? 3600) * 1000;
  const newExp = new Date(Date.now() + expiresIn).toISOString();

  const { error } = await supabase
    .from("user_connections")
    .update({ access_token: newAccess, token_expires_at: newExp, updated_at: new Date().toISOString() })
    .eq("id", conn.id);
  if (error) throw error;
  return newAccess;
}

function decodeBase64Url(b: string) {
  return new TextDecoder().decode(Uint8Array.from(atob(b.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0)));
}

// Extract header by name (case-insensitive)
function header(headers: any[], name: string): string | undefined {
  const h = headers?.find((x) => (x.name || "").toLowerCase() === name.toLowerCase());
  return h?.value;
}

// Bounce detection helpers
function looksLikeBounce(headers: any[], snippet: string) {
  const from = (header(headers, "From")?.toLowerCase() || "");
  const subject = (header(headers, "Subject")?.toLowerCase() || "");
  return from.includes("mailer-daemon") ||
         subject.includes("delivery status notification") ||
         subject.includes("delivery failure") ||
         snippet.toLowerCase().includes("undeliverable");
}

function extractFailedRecipient(msg: any): string | undefined {
  const hdrs = msg.payload?.headers ?? [];
  const xFailed = header(hdrs, "X-Failed-Recipients");
  if (xFailed) return xFailed.split(",")[0].trim().toLowerCase();

  // Walk parts looking for delivery-status content
  const stack = [msg.payload];
  while (stack.length) {
    const p = stack.pop();
    if (!p) continue;
    if (p.parts) stack.push(...p.parts);
    const ct = (p.mimeType || "").toLowerCase();
    if (ct.includes("message/delivery-status") || ct.includes("text/plain")) {
      const body = p.body?.data
        ? decodeBase64Url(p.body.data.replace(/-/g, "+").replace(/_/g, "/"))
        : "";
      const m1 = body.match(/Final-Recipient: .*?;\s*([^\s]+)/i);
      if (m1) return m1[1].toLowerCase();
      const m2 = body.match(/Original-Recipient: .*?;\s*([^\s]+)/i);
      if (m2) return m2[1].toLowerCase();
    }
  }
  return undefined;
}

function extractSmtpStatus(msg: any) {
  const parts: any[] = [];
  const stack = [msg.payload];
  while (stack.length) {
    const p = stack.pop();
    if (!p) continue;
    if (p.parts) stack.push(...p.parts);
    parts.push(p);
  }
  const texts = parts
    .filter(p => (p.mimeType || "").toLowerCase().includes("text/plain") || 
                 (p.mimeType || "").toLowerCase().includes("message/delivery-status"))
    .map(p => p.body?.data ? decodeBase64Url(p.body.data.replace(/-/g, "+").replace(/_/g, "/")) : "")
    .join("\n");

  const diag = texts.match(/Diagnostic-Code:\s*([^\n]+)/i)?.[1]?.trim();
  const status = texts.match(/\b(5\.\d\.\d|4\.\d\.\d)\b/)?.[1];
  const smtp = texts.match(/\b(550|551|552|553|554|421|450|451|452)\b/)?.[1];
  return { diag, status, smtp };
}

async function callDetectReply(payload: { email_id: string; sender?: string; subject?: string; snippet?: string }) {
  const url = `${SUPABASE_URL}/functions/v1/detectReply`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    console.error("detectReply error", await res.text());
  }
}

serve(async () => {
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  // 1) Load all Gmail connections
  const { data: conns, error } = await supabase
    .from("user_connections")
    .select("*")
    .eq("provider", "gmail");
  if (error) return new Response(error.message, { status: 500 });

  for (const conn of (conns as Conn[])) {
    try {
      const token = await ensureAccessToken(conn, supabase);

      // 2) If first time, get current historyId (acts like a checkpoint)
      if (!conn.gmail_history_id) {
        const profile = await gfetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", token);
        await supabase.from("user_connections")
          .update({ gmail_history_id: profile.historyId?.toString() ?? null })
          .eq("id", conn.id);
        continue; // checkpoint set; start from next run
      }

      // 3) Fetch history since last cursor (labels: INBOX)
      const hist = await gfetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/history?startHistoryId=${conn.gmail_history_id}&historyTypes=messageAdded&labelId=INBOX`,
        token
      );

      const messageIds = new Set<string>();
      (hist.history ?? []).forEach((h: any) => {
        (h.messagesAdded ?? []).forEach((m: any) => messageIds.add(m.message.id));
      });

      // 4) For each message, pull details and check for bounces first, then send to detectReply
      for (const id of messageIds) {
        const msg = await gfetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`,
          token
        );

        const headers = msg.payload?.headers ?? [];
        const subject = header(headers, "Subject") ?? "";
        const from = header(headers, "From") ?? "";
        const inReplyTo = header(headers, "In-Reply-To");
        const refs = header(headers, "References");
        const snippet = msg.snippet ?? "";

        // Check for bounce before reply detection
        if (looksLikeBounce(headers, snippet)) {
          const failed = extractFailedRecipient(msg);
          const meta = extractSmtpStatus(msg);
          if (failed) {
            // Find the lead to get project_id/org_id
            const { data: lead } = await supabase
              .from("leads")
              .select("id, project_id, org_id, workspace_id")
              .eq("email", failed.toLowerCase())
              .maybeSingle();

            const project_id = lead?.project_id || lead?.org_id || lead?.workspace_id || null;
            
            if (project_id) {
              // Add to suppression
              await supabase.from("suppress_list").upsert({
                project_id: project_id,
                org_id: lead?.org_id || null,
                workspace_id: lead?.workspace_id || null,
                email: failed,
                reason: meta.diag || 'Bounce',
                kind: 'bounce',
                source: 'gmail-dsn',
                details: meta
              }, { 
                onConflict: lead?.org_id ? "org_id,email" : lead?.workspace_id ? "workspace_id,email" : "project_id,email" 
              });

              // Mark lead + campaign_leads as Bounced
              if (lead) {
                await supabase.from("leads").update({ status: "Bounced" }).eq("id", lead.id);
                const { data: links } = await supabase
                  .from("campaign_leads")
                  .select("campaign_id")
                  .eq("lead_id", lead.id);
                if (links?.length) {
                  await supabase
                    .from("campaign_leads")
                    .update({ state: "Bounced", last_error: meta.diag || 'Bounce' })
                    .eq("lead_id", lead.id);
                  // Cancel queued follow-ups for this lead
                  await supabase
                    .from("send_queue")
                    .update({ state: "Skipped" })
                    .eq("lead_id", lead.id)
                    .eq("state", "Queued");
                }
              }
            }
          }
          continue; // handled as bounce; no reply detection
        }

        // Extract sender email
        let fromEmail: string | undefined;
        if (from) {
          const angleBracketMatch = from.match(/<([^>]+)>/);
          if (angleBracketMatch) {
            fromEmail = angleBracketMatch[1].toLowerCase().trim();
          } else {
            const emailPatternMatch = from.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
            if (emailPatternMatch) {
              fromEmail = emailPatternMatch[1].toLowerCase().trim();
            } else {
              fromEmail = from.toLowerCase().trim();
            }
          }
        }

        // Find lead by email
        let lead_id: string | null = null;
        let project_id: string | null = null;
        if (fromEmail && fromEmail.includes("@")) {
          const { data: lead } = await supabase
            .from("leads")
            .select("id, project_id, org_id, workspace_id")
            .eq("email", fromEmail)
            .maybeSingle();
          
          if (lead) {
            lead_id = lead.id;
            project_id = lead.project_id || lead.org_id || lead.workspace_id || null;
          }
        }

        // Insert reply into replies table
        if (lead_id && project_id && fromEmail) {
          // Extract body text from message parts
          let bodyText = snippet;
          const parts: any[] = [];
          const stack = [msg.payload];
          while (stack.length) {
            const p = stack.pop();
            if (!p) continue;
            if (p.parts) stack.push(...p.parts);
            if ((p.mimeType || "").toLowerCase().includes("text/plain")) {
              if (p.body?.data) {
                const decoded = decodeBase64Url(p.body.data.replace(/-/g, "+").replace(/_/g, "/"));
                if (decoded && decoded.length > snippet.length) {
                  bodyText = decoded;
                }
              }
            }
          }

          await supabase.from("replies").upsert({
            project_id,
            lead_id,
            from_email: fromEmail,
            subject,
            body: bodyText || snippet,
            received_at: new Date().toISOString(),
            status: "Open"
          });
        }

        // Heuristic: map the reply back to our outbound by Message-ID (stored as email_id on leads)
        // Prefer In-Reply-To; fallback to last reference; else threadId if you stored it.
        let email_id: string | undefined = inReplyTo || refs?.split(/\s+/).pop() || msg.threadId;

        // Clean <...> if present
        if (email_id?.startsWith("<") && email_id.endsWith(">")) {
          email_id = email_id.slice(1, -1);
        }

        if (email_id) {
          await callDetectReply({ email_id, sender: from, subject, snippet });
        }
      }

      // 5) Advance cursor to latest
      if (hist.historyId) {
        await supabase
          .from("user_connections")
          .update({ gmail_history_id: String(hist.historyId), updated_at: new Date().toISOString() })
          .eq("id", conn.id);
      }
    } catch (e) {
      console.error("gmailPoller error for connection", conn.id, e);
      // continue other connections
    }
  }

  return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
});

