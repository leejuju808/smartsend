import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js";

function svc() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

export const corsHeaders = {
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
};

Deno.serve( async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const supabase = svc();

  const { data: accts, error } = await supabase
    .from("connected_accounts")
    .select("id, provider, access_token, email, last_poll_at")
    .eq("provider", "outlook")
    .limit(50);
  if (error) return new Response(JSON.stringify({ ok:false, error:error.message }), { status: 400, headers: corsHeaders });

  let ingested = 0;

  for (const a of accts ?? []) {
    try {
      // last 2 minutes received
      const since = new Date(Date.now() - 2*60*1000).toISOString();
      const res = await fetch(`https://graph.microsoft.com/v1.0/me/messages?$filter=receivedDateTime ge ${since} and inferenceClassification eq 'focused'&$top=25`, {
        headers: { Authorization: `Bearer ${a.access_token}` }
      });
      if (!res.ok) throw new Error(`Graph list failed: ${res.status} ${await res.text()}`);
      const json = await res.json();

      for (const m of (json.value ?? [])) {
        const from = m.from?.emailAddress?.address ?? "";
        const to = (m.toRecipients?.[0]?.emailAddress?.address) ?? "";
        const subject = m.subject ?? "";
        const text = (m.bodyPreview ?? "") as string;
        const html = m.body?.contentType === "html" ? (m.body?.content ?? null) : null;
        const convId = m.conversationId ?? null;

        const { data: ingestMeta, error: rpcErr } = await supabase.rpc("ingest_inbound_message", {
          p_provider: "outlook",
          p_account: a.id,
          p_provider_thread_id: convId,
          p_provider_message_id: m.id,
          p_from_email: from,
          p_to_email: to,
          p_subject: subject,
          p_html: html,
          p_text: text,
          p_headers: m
        });
        if (rpcErr) throw rpcErr;

        const meta = (ingestMeta ?? null) as {
          message_id?: string | null;
          thread_id?: string | null;
          campaign_id?: string | null;
          lead_id?: string | null;
        };

        if (meta?.campaign_id && meta?.lead_id) {
          const headersMap = outlookHeaders(m);
          await triggerReplyClassify({
            campaignId: meta.campaign_id,
            leadId: meta.lead_id,
            threadId: meta.thread_id ?? null,
            stepId: null,
            subject,
            text,
            html,
            headers: headersMap,
          }).catch(() => {});
        }
        ingested++;
      }

      await supabase.from("connected_accounts").update({ last_poll_at: new Date().toISOString() }).eq("id", a.id);
    } catch (e) {
      await supabase.from("dead_letter_queue").insert({
        payload: { account_id: a.id, provider: "outlook" },
        attempts: 1,
        last_error: String(e),
        meta: {}
      });
    }
  }

  return new Response(JSON.stringify({ ok:true, ingested }), { headers: { "Content-Type":"application/json", ...corsHeaders }});
});

function outlookHeaders(message: any): Record<string, string> {
  const out: Record<string, string> = {};
  const headers = Array.isArray(message?.internetMessageHeaders) ? message.internetMessageHeaders : [];
  for (const h of headers) {
    const name = typeof h?.name === "string" ? h.name : null;
    const value = typeof h?.value === "string" ? h.value : null;
    if (name && value) {
      out[name] = value;
    }
  }
  if (typeof message?.internetMessageId === "string") {
    out["Message-ID"] = message.internetMessageId;
  }
  return out;
}

async function triggerReplyClassify(input: {
  campaignId: string;
  leadId: string;
  threadId: string | null;
  stepId: string | null;
  subject: string;
  text: string;
  html: string | null;
  headers: Record<string, string>;
}) {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return;

  await fetch(`${url}/functions/v1/reply-classify`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${key}`
    },
    body: JSON.stringify({
      campaign_id: input.campaignId,
      lead_id: input.leadId,
      thread_id: input.threadId,
      step_id: input.stepId,
      subject: input.subject ?? null,
      text: input.text ?? null,
      html: input.html ?? null,
      headers: Object.keys(input.headers).length ? input.headers : null,
    }),
  });
}



