// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

async function ensureAccessToken(account_id: string) {
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/oauth-refresh`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type":"application/json", "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
    body: JSON.stringify({ account_id })
  });
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || "token error");
  return j.access_token as string;
}

async function upsertThreadAndInbound({ account, fromEmail, toEmail, subject, html, receivedAt, provider, providerMsgId, providerThreadId, inReplyTo }:{
  account: any, fromEmail: string, toEmail: string, subject: string, html: string, receivedAt: string,
  provider: 'gmail' | 'outlook', providerMsgId?: string | null, providerThreadId?: string | null, inReplyTo?: string | null
}) {
  // Find lead by toEmail OR fromEmail depending on direction; replies are from lead => fromEmail is lead
  const { data: lead } = await sb.from("leads").select("id").eq("email", fromEmail).maybeSingle();
  if (!lead?.id) return; // unknown lead, ignore quietly

  // Try to find campaign via last sent to this lead
  const { data: lastSend } = await sb
    .from("send_logs")
    .select("campaign_id, provider_thread_id, provider_message_id")
    .eq("lead_id", lead.id)
    .order("created_at", { ascending: false })
    .limit(1).maybeSingle();

  const campaign_id = lastSend?.campaign_id ?? null;

  // Upsert thread
  const { data: thread } = await sb.from("inbox_threads").upsert({
    campaign_id,
    account_id: account.id,
    lead_id: lead.id,
    provider,
    provider_thread_id: providerThreadId ?? lastSend?.provider_thread_id ?? null,
    subject
  }, { onConflict: "account_id,provider_thread_id" }).select("id").maybeSingle();

  if (!thread?.id) return;
  
  // Insert inbound message
  const { data: message } = await sb.from("inbox_messages").insert({
    thread_id: thread.id,
    direction: 'inbound',
    from_email: fromEmail,
    to_email: toEmail,
    subject,
    body_html: html,
    received_at: receivedAt,
    provider_message_id: providerMsgId ?? null,
    in_reply_to: inReplyTo ?? null
  }).select("id").single();

  // Mark thread replied & stop future steps
  await sb.from("inbox_threads").update({ 
    replied_at: receivedAt, 
    stopped_by_reply: true, 
    updated_at: new Date().toISOString() 
  }).eq("id", thread.id);
  
  await sb.rpc("cancel_future_queue_for_thread", { p_thread: thread.id }).catch(()=>{});

  // Attribute reply to most recent send for this lead/account
  const ledgerAccountId =
    account.account_id ||
    account.workspace_id ||
    account.account ||
    null;

  if (ledgerAccountId && lead?.id) {
    const { data: lastSend } = await sb
      .from("email_sends")
      .select("id")
      .eq("account_id", ledgerAccountId)
      .eq("lead_id", lead.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastSend?.id) {
      await sb.from("email_events").insert({
        account_id: ledgerAccountId,
        send_id: lastSend.id,
        type: "reply",
        meta: {
          inbox_message_id: message?.id ?? null,
          provider_message_id: providerMsgId ?? null,
        },
      }).catch(()=>{});
    }
  }

  // Trigger AI classification (async, don't wait)
  if (message?.id) {
    fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/inbound-classifier`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`
      },
      body: JSON.stringify({ message_id: message.id })
    }).catch(() => {}); // Fire and forget
  }
}

async function pollGmail(account: any, sinceISO: string) {
  const access = await ensureAccessToken(account.id);
  // Fetch recent inbox messages addressed to our mailbox, not from us
  const q = `newer_than:7d -from:${account.from_email || account.email_address}`;
  const listURL = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(q)}&maxResults=50`;
  const lres = await fetch(listURL, { headers: { Authorization: `Bearer ${access}` } });
  const ljson = await lres.json();
  
  for (const m of ljson.messages ?? []) {
    const mres = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=full`, { 
      headers: { Authorization: `Bearer ${access}` } 
    });
    const msg = await mres.json();
    const headers = Object.fromEntries((msg.payload?.headers ?? []).map((h:any)=>[h.name.toLowerCase(), h.value]));
    const from = headers['from'] ?? '';
    const to = headers['to'] ?? (account.from_email || account.email_address);
    const subject = headers['subject'] ?? '';
    const date = headers['date'] ? new Date(headers['date']).toISOString() : new Date().toISOString();
    const inReplyTo = headers['in-reply-to'] ?? null;

    // naive extraction of HTML
    const parts = (msg.payload?.parts ?? []);
    const htmlPart = parts.find((p:any)=>p.mimeType==='text/html') ?? msg.payload;
    const html = htmlPart?.body?.data 
      ? decodeURIComponent(escape(atob(htmlPart.body.data.replace(/-/g,'+').replace(/_/g,'/')))) 
      : '';

    // normalize "From" address
    const fromEmail = (from.match(/<([^>]+)>/)?.[1] ?? from).trim();

    await upsertThreadAndInbound({
      account,
      fromEmail,
      toEmail: to,
      subject, 
      html,
      receivedAt: date,
      provider: 'gmail',
      providerMsgId: msg.id,
      providerThreadId: msg.threadId,
      inReplyTo: inReplyTo
    });
  }
}

async function pollOutlook(account: any, sinceISO: string) {
  const access = await ensureAccessToken(account.id);
  const filter = `receivedDateTime ge ${sinceISO}`;
  const url = `https://graph.microsoft.com/v1.0/me/mailFolders/Inbox/messages?$top=50&$filter=${encodeURIComponent(filter)}&$orderby=receivedDateTime desc`;
  const lres = await fetch(url, { headers: { Authorization: `Bearer ${access}` } });
  const j = await lres.json();
  
  for (const msg of j.value ?? []) {
    const fromEmail = msg.from?.emailAddress?.address ?? "";
    if (!fromEmail || fromEmail.toLowerCase() === (account.from_email || account.email_address || "").toLowerCase()) continue;
    
    const html = msg.body?.content || "";
    const subject = msg.subject || "";
    const toEmail = (msg.toRecipients?.[0]?.emailAddress?.address) || (account.from_email || account.email_address);
    const date = msg.receivedDateTime || new Date().toISOString();
    
    await upsertThreadAndInbound({
      account,
      fromEmail, 
      toEmail, 
      subject, 
      html,
      receivedAt: date,
      provider: 'outlook',
      providerMsgId: msg.internetMessageId ?? msg.id,
      providerThreadId: msg.conversationId ?? null,
      inReplyTo: (msg.inReplyTo ?? null)
    });
  }
}

Deno.serve(async (req) => {
  try {
    const { account_id } = (await req.json().catch(()=> ({}))) ?? {};
    const sinceISO = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

    if (account_id) {
      const { data: acc } = await sb.from("connected_accounts").select("*").eq("id", account_id).maybeSingle();
      if (!acc) throw new Error("account not found");
      if (acc.provider === 'gmail') await pollGmail(acc, sinceISO);
      else if (acc.provider === 'outlook') await pollOutlook(acc, sinceISO);
      else throw new Error("unsupported provider");
      return new Response(JSON.stringify({ ok: true }), { headers: { "content-type":"application/json" } });
    }

    // All accounts (active)
    const { data: accounts } = await sb.from("connected_accounts").select("*");
    for (const acc of accounts ?? []) {
      try {
        if (acc.provider === 'gmail') await pollGmail(acc, sinceISO);
        else if (acc.provider === 'outlook') await pollOutlook(acc, sinceISO);
      } catch (_) { /* continue */ }
    }
    return new Response(JSON.stringify({ ok: true }), { headers: { "content-type":"application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok:false, error: String(e) }), { status: 500, headers: { "content-type":"application/json" } });
  }
});

