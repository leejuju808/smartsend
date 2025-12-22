import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { google } from "googleapis";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Get Gmail client for user
async function getGmailForUser(userId: string) {
  const { data: mb } = await admin
    .from("mailboxes")
    .select("gmail_refresh_token")
    .eq("owner", userId)
    .eq("provider", "gmail")
    .maybeSingle();

  if (!mb?.gmail_refresh_token)
    throw new Error("No Gmail OAuth token for user");

  const oAuth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
    process.env.GOOGLE_OAUTH_REDIRECT_URL!
  );
  oAuth2.setCredentials({ refresh_token: mb.gmail_refresh_token });

  return google.gmail({ version: "v1", auth: oAuth2 });
}

// Naive parser for DSN text
function extractToEmailAndCode(snippet: string) {
  const s = (snippet || "").toLowerCase();
  const emailMatch = s.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/);
  const codeMatch = s.match(/\b[45]\.\d\.\d\b/); // 4.x.x or 5.x.x
  return { to: emailMatch?.[0] || null, code: codeMatch?.[0] || null };
}

export async function POST(req: NextRequest) {
  if (
    (req.headers.get("authorization") || "") !==
    `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Find users with Gmail connected
  const { data: conns } = await admin
    .from("mailboxes")
    .select("owner")
    .eq("provider", "gmail");

  const since = new Date(Date.now() - 1000 * 60 * 30).toISOString(); // last 30 min
  const results: any[] = [];

  for (const c of conns || []) {
    try {
      const gmail = await getGmailForUser(c.owner);
      const query = `from:"mail delivery subsystem" newer_than:30m`;
      const list = await gmail.users.messages.list({
        userId: "me",
        q: query,
        maxResults: 25,
      });
      const messages = list.data.messages || [];
      for (const m of messages) {
        const full = await gmail.users.messages.get({
          userId: "me",
          id: m.id!,
          format: "full",
        });
        const snippet = full.data.snippet || "";
        const { to, code } = extractToEmailAndCode(snippet);
        if (!to) continue;

        // POST to bounce ingest
        await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/inbound/bounce`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.INBOUND_SECRET!}`,
          },
          body: JSON.stringify({
            provider: "gmail",
            user_id: c.owner,
            to_email: to,
            status_code: code || undefined,
            diagnostic: snippet.slice(0, 500),
          }),
        });
      }
      results.push({ user: c.owner, scanned: messages.length });
    } catch (e: any) {
      results.push({ user: c.owner, error: String(e.message || e) });
    }
  }

  return NextResponse.json({ results, since });
} 