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

