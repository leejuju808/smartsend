// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
// @ts-ignore -- URL import resolved by Deno runtime
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// @ts-ignore -- Deno runtime import with explicit extension
import { ensureGmailAccess } from "../_shared/refreshers.ts";
// @ts-ignore -- Deno runtime import with explicit extension
import { looksLikeBounce, extractHtml } from "../_shared/inbound-utils.ts";

declare const Deno: any;

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req: Request) => {
  const sb = createClient(SB_URL, SB_KEY);

  let payload: any = null;
  if (req.method === "POST") {
    payload = await req.json().catch(() => null);
  }
  const url = new URL(req.url);
  const onlyAccount = payload?.account_id ?? url.searchParams.get("account") ?? null;

  let accounts: any[] = [];
  if (onlyAccount) {
    const { data, error } = await sb
      .from("connected_accounts")
      .select("id, provider, access_token, refresh_token, expires_at, email")
      .eq("provider", "gmail")
      .eq("id", onlyAccount)
      .maybeSingle();
    if (error) return new Response(error.message, { status: 500 });
    if (!data) {
      return new Response(JSON.stringify({ ok: false, reason: "account_not_found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }
    accounts = [data];
  } else {
    const { data, error } = await sb
      .from("connected_accounts")
      .select("id, provider, access_token, refresh_token, expires_at, email")
      .eq("provider", "gmail");
    if (error) return new Response(error.message, { status: 500 });
    accounts = data || [];
  }

  let fetchedTotal = 0;
  for (const acc of accounts) {
    let conn: any;
    try {
      conn = await ensureGmailAccess(acc);
    } catch (err) {
      console.log("gmail access refresh failed", acc.id, err instanceof Error ? err.message : String(err));
      continue;
    }

    const { data: sync } = await sb
      .from("account_sync_state")
      .select("*")
      .eq("account_id", acc.id)
      .maybeSingle();

    const since = sync?.last_checked_at
      ? new Date(new Date(sync.last_checked_at).getTime() - 5 * 60 * 1000)
      : new Date(Date.now() - 24 * 60 * 60 * 1000);

    const q = `in:inbox newer_than:2d -from:${acc.email}`;
    const listRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(q)}&maxResults=${onlyAccount ? 5 : 50}`,
      { headers: { Authorization: `Bearer ${conn.access_token}` } }
    );
    if (!listRes.ok) {
      console.log("gmail list failed", acc.id, await listRes.text());
      continue;
    }
    const list = await listRes.json();
    const messages = list.messages || [];
    fetchedTotal += messages.length;

    for (const it of messages) {
      const mRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${it.id}?format=full`,
        { headers: { Authorization: `Bearer ${conn.access_token}` } }
      );
      if (!mRes.ok) continue;
      const msg = await mRes.json();

      const headers = Object.fromEntries(
        (msg.payload?.headers || []).map((h: any) => [String(h.name).toLowerCase(), String(h.value ?? "")])
      );

      const from = headers["from"] || "";
      const subject = headers["subject"] || "";
      const rawDate = headers["date"] || msg.internalDate;
      const parsedDate = rawDate ? new Date(rawDate) : new Date();
      const msgDate = isNaN(parsedDate.getTime()) && typeof rawDate === "string"
        ? new Date(Number(rawDate))
        : parsedDate;
      if (msgDate < since) continue;

      function getPart(p: any): string | null {
        if (!p) return null;
        if (p.mimeType === "text/html" && p.body?.data) {
          return atob(p.body.data.replace(/-/g, "+").replace(/_/g, "/"));
        }
        if (p.mimeType === "text/plain" && p.body?.data) {
          return `<pre>${atob(p.body.data.replace(/-/g, "+").replace(/_/g, "/"))}</pre>`;
        }
        if (p.parts) {
          for (const sp of p.parts) {
            const got = getPart(sp);
            if (got) return got;
          }
        }
        return null;
      }

      const html = getPart(msg.payload) || extractHtml(msg.snippet ?? "");

      const replyEmail = (from.match(/<([^>]+)>/)?.[1] || from).trim().toLowerCase();
      const { data: lead } = await sb.from("leads").select("id").eq("email", replyEmail).maybeSingle();
      if (!lead?.id) continue;

      const { data: lastSend } = await sb
        .from("send_logs")
        .select("campaign_id")
        .eq("lead_id", lead.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!lastSend?.campaign_id) continue;

      if (
        looksLikeBounce(from, subject, { "x-failed-recipients": headers["x-failed-recipients"] })
      ) {
        await fetch(`${SB_URL}/functions/v1/bounce-upsert`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${SB_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            provider: "gmail",
            account_id: acc.id,
            lead_id: lead.id,
            campaign_id: lastSend.campaign_id,
            provider_message_id: msg.id,
            reason: subject || "gmail:dsn",
            raw: { headers, snippet: msg.snippet },
          }),
        });
      } else {
        const { error: inboundErr } = await sb.rpc("_inbox_write_inbound", {
          p_lead: lead.id,
          p_campaign: lastSend.campaign_id,
          p_provider: "gmail",
          p_provider_thread_id: msg.threadId,
          p_provider_message_id: msg.id,
          p_subject: subject || "(no subject)",
          p_body_html: html,
          p_ai_label: null,
        });
        if (inboundErr) {
          console.log("inbound write failed", inboundErr.message);
        }
      }
    }

    const nowIso = new Date().toISOString();
    if (sync?.id) {
      await sb.from("account_sync_state").update({ last_checked_at: nowIso }).eq("id", sync.id);
    } else {
      await sb.from("account_sync_state").insert({
        account_id: acc.id,
        provider: "gmail",
        last_checked_at: nowIso,
      });
    }
  }

  return new Response(JSON.stringify({ ok: true, fetched: fetchedTotal }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
});