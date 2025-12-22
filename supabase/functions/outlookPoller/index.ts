// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MS_CLIENT_ID = Deno.env.get("MS_CLIENT_ID")!;
const MS_CLIENT_SECRET = Deno.env.get("MS_CLIENT_SECRET")!;
const MS_REDIRECT_URI = Deno.env.get("MS_REDIRECT_URI")!;

async function listRecentMessages(token: string, sinceISO: string) {
  // receivedDateTime ge {sinceISO}, top 50 newest
  const url = new URL("https://graph.microsoft.com/v1.0/me/messages");
  url.searchParams.set("$filter", `receivedDateTime ge ${sinceISO}`);
  url.searchParams.set("$orderby", "receivedDateTime desc");
  url.searchParams.set("$top", "50");
  const r = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(await r.text());
  return (await r.json()).value as any[];
}

async function refreshOutlookToken(refreshToken: string): Promise<string> {
  const params = new URLSearchParams({
    client_id: MS_CLIENT_ID,
    client_secret: MS_CLIENT_SECRET,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    redirect_uri: MS_REDIRECT_URI,
  });
  const r = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
  if (!r.ok) throw new Error(`Outlook token refresh failed: ${await r.text()}`);
  const data = await r.json();
  return data.access_token as string;
}

serve(async () => {
  const supabase = createClient(SUPABASE_URL, SERVICE);

  // fetch all Outlook connections to poll
  const { data: conns } = await supabase.from("user_connections").select("id,user_id,access_token,token_expires_at,email_address,refresh_token").eq("provider", "outlook");
  if (!conns?.length) return new Response(JSON.stringify({ polled: 0 }), { headers: { "Content-Type": "application/json" } });

  let polled = 0;
  for (const c of conns) {
    try {
      // Ensure token is fresh
      let token = c.access_token as string;
      const expires = new Date(c.token_expires_at as string).getTime();
      if (Date.now() >= expires - 60_000 && c.refresh_token) {
        token = await refreshOutlookToken(c.refresh_token as string);
        const newExpires = new Date(Date.now() + 3600 * 1000).toISOString(); // Assume 1hr expiry
        await supabase.from("user_connections").update({ access_token: token, token_expires_at: newExpires }).eq("id", c.id);
      }

      // determine since timestamp per-connection (store last poll on table metadata)
      const since = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(); // last 6h fallback
      const messages = await listRecentMessages(token, since);

      for (const m of messages) {
        // Ignore sent by self
        if ((m.from?.emailAddress?.address || "").toLowerCase() === (c.email_address || "").toLowerCase()) continue;

        const from = m.from?.emailAddress?.address?.toLowerCase();
        if (!from) continue;

        // map to lead
        const { data: lead } = await supabase.from("leads").select("id,project_id,status,email").eq("email", from).maybeSingle();
        if (!lead) continue;

        // store reply
        await supabase.from("replies").upsert({
          project_id: lead.project_id,
          lead_id: lead.id,
          from_email: from,
          subject: m.subject || "",
          body: m.bodyPreview || "",
          received_at: m.receivedDateTime,
          status: "Open"
        });

        // mark replied (lead + campaign_leads)
        await supabase.from("leads").update({ status: "Replied" }).eq("id", lead.id);
        await supabase.from("campaign_leads").update({ state: "Replied" }).eq("lead_id", lead.id);

        // cancel queued follow-ups
        await supabase.from("send_queue").update({ state: "Skipped" }).eq("lead_id", lead.id).eq("state", "Queued");
      }
      polled++;
    } catch (e) {
      console.error("outlookPoller error for connection", c.id, e);
      // continue other connections
    }
  }
  return new Response(JSON.stringify({ polled }), { headers: { "Content-Type": "application/json" } });
});

