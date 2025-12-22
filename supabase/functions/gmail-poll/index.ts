// supabase/functions/gmail-poll/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js";

const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";

function svc() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

async function listRecentMessages(token: string) {
  // Pull unread in last 2 minutes (approx window); refine later with historyId.
  const q = encodeURIComponent("newer_than:2m is:inbox");
  const res = await fetch(`${GMAIL}/messages?q=${q}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Gmail list failed: ${res.status} ${await res.text()}`);
  const json = await res.json();
  return (json.messages ?? []) as { id: string; threadId: string }[];
}

async function getMessage(token: string, id: string) {
  const res = await fetch(`${GMAIL}/messages/${id}?format=full`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Gmail get failed: ${res.status} ${await res.text()}`);
  return await res.json();
}

function header(hs: any[], name: string): string | null {
  const h = (hs || []).find((x: any) => x.name?.toLowerCase() === name.toLowerCase());
  return h ? String(h.value) : null;
}

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const supabase = svc();

  // 1) Fetch connected Gmail accounts
  const { data: accts, error } = await supabase
    .from("connected_accounts")
    .select("id, provider, access_token, email, last_poll_at")
    .eq("provider", "gmail")
    .limit(50);
  if (error) return new Response(JSON.stringify({ ok:false, error:error.message }), { status: 400, headers: corsHeaders });

  let ingested = 0;

  for (const a of accts ?? []) {
    try {
      const msgs = await listRecentMessages(a.access_token);
      for (const m of msgs) {
        const full = await getMessage(a.access_token, m.id);
        const headers = full.payload?.headers ?? [];
        const from = header(headers, "From") ?? "";
        const to = header(headers, "To") ?? "";
        const subject = header(headers, "Subject") ?? "";
        const text = full.snippet ?? "";
        const html = null;

        // Ingest
        const { data: ingestMeta, error: rpcErr } = await supabase.rpc("ingest_inbound_message", {
          p_provider: "gmail",
          p_account: a.id,
          p_provider_thread_id: full.threadId,
          p_provider_message_id: full.id,
          p_from_email: from,
          p_to_email: to,
          p_subject: subject,
          p_html: html,
          p_text: text,
          p_headers: full.payload ?? {},
        });
        if (rpcErr) throw rpcErr;

        const meta = (ingestMeta ?? null) as {
          message_id?: string | null;
          thread_id?: string | null;
          campaign_id?: string | null;
          lead_id?: string | null;
        };

        if (meta?.campaign_id && meta?.lead_id) {
          const headersMap = toHeaderMap(headers);
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
      // log and continue others
      await supabase.from("dead_letter_queue").insert({
        payload: { account_id: a.id, provider: "gmail" },
        attempts: 1,
        last_error: String(e),
        meta: {}
      });
    }
  }

  return new Response(JSON.stringify({ ok:true, ingested }), { headers: { "Content-Type":"application/json", ...corsHeaders }});
});

function toHeaderMap(headers: any[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const h of headers || []) {
    const name = typeof h?.name === "string" ? h.name : null;
    const value = typeof h?.value === "string" ? h.value : null;
    if (name && value) {
      out[name] = value;
    }
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
