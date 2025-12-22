// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { sendViaGmail } from "../_shared/send-gmail.ts";
import { sendViaOutlook } from "../_shared/send-outlook.ts";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ReplyInput = {
  thread_id: string;
  subject?: string | null;
  body_html: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
  }

  const sb = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } });

  try {
    const { thread_id, subject, body_html } = (await req.json()) as ReplyInput;
    if (!thread_id || !body_html) throw new Error("thread_id and body_html required");

    // 1) Load thread + lead + account + latest message ids for threading
    const { data: t, error: tErr } = await sb
      .from("inbox_threads")
      .select("id, campaign_id, lead_id, provider, provider_thread_id, account_id")
      .eq("id", thread_id)
      .maybeSingle();
    if (tErr || !t) throw new Error("thread not found");

    const { data: lead, error: leadErr } = await sb
      .from("leads")
      .select("email")
      .eq("id", t.lead_id)
      .maybeSingle();
    if (leadErr || !lead?.email) throw new Error("lead email missing");

    const { data: acc, error: accErr } = await sb
      .from("connected_accounts")
      .select("*")
      .eq("id", t.account_id)
      .maybeSingle();
    if (accErr || !acc) throw new Error("connected account missing");

    const { data: lastMsgs, error: lastErr } = await sb
      .from("inbox_messages")
      .select("provider, provider_message_id, in_reply_to, references:references, direction, created_at")
      .eq("thread_id", thread_id)
      .order("created_at", { ascending: false })
      .limit(5);
    if (lastErr) throw lastErr;

    const last = lastMsgs?.[0];
    const inReplyTo = last?.provider_message_id ?? null;
    const refs =
      lastMsgs
        ?.map((m) => m.provider_message_id)
        .filter(Boolean)
        .slice(0, 10)
        .reverse()
        .join(" ") ?? null;

    // 2) Send via provider
    const subj = subject || "Re:";
    let sent:
      | { ok: true; provider: "gmail" | "outlook"; providerMessageId?: string; providerThreadId?: string }
      | { ok: false; error: string };

    if (acc.provider === "gmail") {
      sent = await sendViaGmail({
        conn: acc,
        fromEmail: acc.email,
        to: lead.email,
        subject: subj,
        html: body_html,
        threadId: t.provider === "gmail" ? t.provider_thread_id : undefined,
        inReplyTo: inReplyTo || undefined,
        references: refs || undefined,
      });
    } else if (acc.provider === "outlook") {
      sent = await sendViaOutlook({
        conn: acc,
        fromEmail: acc.email,
        to: lead.email,
        subject: subj,
        html: body_html,
        replyToId: inReplyTo || undefined,
      });
    } else {
      throw new Error(`Unsupported provider: ${acc.provider}`);
    }

    if (!sent.ok) throw new Error((sent as any).error);

    // 3) Persist message + log
    const { error: wErr } = await sb.rpc("_inbox_write_outbound", {
      p_thread: t.id,
      p_lead: t.lead_id,
      p_campaign: t.campaign_id,
      p_account: t.account_id,
      p_provider: sent.provider,
      p_provider_message_id: (sent as any).providerMessageId ?? null,
      p_provider_thread_id: (sent as any).providerThreadId ?? t.provider_thread_id ?? null,
      p_subject: subj,
      p_body_html: body_html,
      p_in_reply_to: inReplyTo,
      p_references: refs,
    });
    if (wErr) throw wErr;

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (e) {
    console.error("inbox-reply error", e);
    return new Response(JSON.stringify({ ok: false, error: String(e?.message ?? e) }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});

