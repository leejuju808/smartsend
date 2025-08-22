import { google } from "googleapis";
import { supabaseAdmin } from "@/server/supabase";

export async function gmailClientForOwner(owner: string) {
  const { data: mb, error } = await supabaseAdmin
    .from("mailboxes")
    .select("from_email, gmail_refresh_token, last_reply_check_at")
    .eq("owner", owner)
    .eq("provider", "gmail")
    .maybeSingle();
  if (error) throw error;
  if (!mb?.gmail_refresh_token) throw new Error("No Gmail OAuth token");

  const oAuth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
    process.env.GOOGLE_OAUTH_REDIRECT_URL!
  );
  oAuth2.setCredentials({ refresh_token: (mb as any).gmail_refresh_token });

  const gmail = google.gmail({ version: "v1", auth: oAuth2 });
  return { gmail, mb } as const;
}

/** Fetch messages likely to be replies since a certain time */
export async function fetchRecentInbound(owner: string) {
  const { gmail, mb } = await gmailClientForOwner(owner);
  // Default lookback: 2 days if never checked
  const newerThanDays = 7;
  const q = `in:inbox -from:me newer_than:${newerThanDays}d`;

  const res = await gmail.users.messages.list({ userId: "me", q, maxResults: 200 });
  const ids = (res.data.messages || []).map((m) => m.id!).slice(0, 200);

  const out: Array<{ id: string; headers: Record<string, string> }> = [];
  for (const id of ids) {
    const msg = await gmail.users.messages.get({
      userId: "me",
      id,
      format: "metadata",
      metadataHeaders: [
        "Subject",
        "From",
        "To",
        "In-Reply-To",
        "References",
        "Message-ID",
        "Date",
      ],
    });
    const hdrs = Object.fromEntries(
      (msg.data.payload?.headers || []).map((h) => [String(h.name), String(h.value)])
    );
    out.push({ id, headers: hdrs as Record<string, string> });
  }
  return out;
}

import { google } from "googleapis";
import { supabaseAdmin } from "@/server/supabase";

export async function gmailClientForOwner(owner: string) {
  const { data: mb } = await supabaseAdmin
    .from("mailboxes")
    .select("from_email, gmail_refresh_token, last_reply_check_at")
    .eq("owner", owner)
    .eq("provider", "gmail")
    .single();
  if (!mb?.gmail_refresh_token) throw new Error("No Gmail OAuth token");

  const oAuth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
    process.env.GOOGLE_OAUTH_REDIRECT_URL!
  );
  oAuth2.setCredentials({ refresh_token: mb.gmail_refresh_token });

  const gmail = google.gmail({ version: "v1", auth: oAuth2 });
  return { gmail, mb } as { gmail: ReturnType<typeof google.gmail>; mb: any };
}

export async function fetchRecentInbound(owner: string) {
  const { gmail, mb } = await gmailClientForOwner(owner);
  const sinceISO = mb.last_reply_check_at || new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString();
  const newerThanDays = 7;
  const q = `in:inbox -from:me newer_than:${newerThanDays}d`;

  const res = await gmail.users.messages.list({ userId: "me", q, maxResults: 200 });
  const ids = (res.data.messages || []).map((m) => m.id!).slice(0, 200);

  const out: Array<{ id: string; headers: Record<string, string> }> = [];
  for (const id of ids) {
    const msg = await gmail.users.messages.get({
      userId: "me",
      id,
      format: "metadata",
      metadataHeaders: [
        "Subject",
        "From",
        "To",
        "In-Reply-To",
        "References",
        "Message-ID",
        "Date",
      ],
    });
    const hdrs = Object.fromEntries(
      (msg.data.payload?.headers || []).map((h) => [String(h.name), String(h.value)])
    );
    out.push({ id, headers: hdrs as any });
  }
  return out;
}


// New: fetch inbound with body content for inbox ingestion
export async function fetchRecentInboundWithBody(owner: string) {
  const { gmail } = await gmailClientForOwner(owner);
  const newerThanDays = 7;
  const q = `in:inbox -from:me newer_than:${newerThanDays}d`;

  const res = await gmail.users.messages.list({ userId: "me", q, maxResults: 200 });
  const ids = (res.data.messages || []).map((m) => m.id!).slice(0, 200);

  function decodeBase64Url(input?: string | null): string {
    if (!input) return "";
    const b64 = input.replace(/-/g, "+").replace(/_/g, "/");
    try { return Buffer.from(b64, "base64").toString("utf8"); } catch { return ""; }
  }

  function extractBody(payload: any): { text: string; html: string } {
    let text = "";
    let html = "";
    function walk(p: any) {
      if (!p) return;
      if (p.mimeType === "text/plain" && p.body?.data) text += decodeBase64Url(p.body.data);
      else if (p.mimeType === "text/html" && p.body?.data) html += decodeBase64Url(p.body.data);
      if (Array.isArray(p.parts)) for (const part of p.parts) walk(part);
    }
    walk(payload);
    return { text: text.trim(), html: html.trim() };
  }

  const out: Array<{ id: string; headers: Record<string, string>; bodyText: string; bodyHtml?: string }> = [];
  for (const id of ids) {
    const msg = await gmail.users.messages.get({ userId: "me", id, format: "full" });
    const headers = Object.fromEntries((msg.data.payload?.headers || []).map((h) => [String(h.name), String(h.value)]));
    const { text, html } = extractBody(msg.data.payload);
    out.push({ id, headers: headers as any, bodyText: text || (html ? html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : ""), bodyHtml: html });
  }
  return out;
}

