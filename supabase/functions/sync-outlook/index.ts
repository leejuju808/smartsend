// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
// @ts-ignore -- URL import resolved by Deno runtime
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// @ts-ignore -- Deno runtime import with explicit extension
import { ensureOutlookAccess } from "../_shared/refreshers.ts";
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
      .eq("provider", "outlook")
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
      .eq("provider", "outlook");
    if (error) return new Response(error.message, { status: 500 });
    accounts = data || [];
  }

  let fetchedTotal = 0;
  for (const acc of accounts) {
    let conn: any;
    try {
      conn = await ensureOutlookAccess(acc);
    } catch (err) {
      console.log("outlook access refresh failed", acc.id, err instanceof Error ? err.message : String(err));
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
    const sinceIso = since.toISOString();

    const urlStr = `https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$top=${onlyAccount ? 5 : 50}&$orderby=receivedDateTime desc&$filter=receivedDateTime ge ${sinceIso}`;
    const res = await fetch(urlStr, { headers: { Authorization: `Bearer ${conn.access_token}` } });
    if (!res.ok) {
      console.log("outlook list failed", acc.id, await res.text());
      continue;
    }
    const js = await res.json();
    const msgs = js.value || [];
    fetchedTotal += msgs.length;

    for (const m of msgs) {
      const from = m.from?.emailAddress?.address || "";
      if (from.toLowerCase() === (acc.email || "").toLowerCase()) continue;
      const subject = m.subject || "";
      const bodyHtml = extractHtml({
        html: m.body?.contentType === "html" ? m.body?.content ?? "" : undefined,
        text: m.body?.contentType === "text" ? m.body?.content ?? "" : undefined,
      });
      const providerMessageId = m.id;
      const providerThreadId = m.conversationId;

      const replyEmail = (from || "").trim().toLowerCase();
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

      if (looksLikeBounce(from, subject)) {
        await fetch(`${SB_URL}/functions/v1/bounce-upsert`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${SB_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            provider: "outlook",
            account_id: acc.id,
            lead_id: lead.id,
            campaign_id: lastSend.campaign_id,
            provider_message_id: providerMessageId,
            reason: subject || "graph:ndr",
            raw: { internetMessageId: m.internetMessageId },
          }),
        });
      } else {
        const { error: inboundErr } = await sb.rpc("_inbox_write_inbound", {
          p_lead: lead.id,
          p_campaign: lastSend.campaign_id,
          p_provider: "outlook",
          p_provider_thread_id: providerThreadId,
          p_provider_message_id: providerMessageId,
          p_subject: subject || "(no subject)",
          p_body_html: bodyHtml,
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
        provider: "outlook",
        last_checked_at: nowIso,
      });
    }
  }

  return new Response(JSON.stringify({ ok: true, fetched: fetchedTotal }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
});