// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

async function ensureAccessToken(account_id: string) {
  const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/oauth-refresh`, {
    method: "POST",
    headers: { "content-type":"application/json", "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
    body: JSON.stringify({ account_id })
  });
  const j = await r.json(); if (!j.ok) throw new Error(j.error || "token error");
  return j.access_token as string;
}

function parseBounceHints(subject = "", body = "") {
  const s = (subject + " " + body).toLowerCase();
  const codes = (body.match(/\b5\d{2}\b/g) || []).join(",");
  const reason =
    /user unknown|mailbox unavailable|no such user/.test(s) ? "hard"
    : /mailbox full|quota exceeded|temporary failure|try again/.test(s) ? "soft"
    : /blocked|denied|policy/.test(s) ? "policy"
    : "other";
  return { codes, reason };
}

async function handleBounce({ account, subject, html, text, fromEmail, toEmail, receivedAt }:{
  account:any, subject:string, html:string, text:string, fromEmail:string, toEmail:string, receivedAt:string
}) {
  // identify lead by original "toEmail" that bounced
  const { data: lead } = await sb.from("leads").select("id, email").eq("email", toEmail).maybeSingle();
  if (!lead) return;

  const { codes, reason } = parseBounceHints(subject, (html || "") + " " + (text || ""));
  const delivery_meta = { from: fromEmail, subject, codes, reason };

  // write event
  await sb.from("delivery_events").insert({
    event_type: 'bounce',
    kind: 'bounce',
    lead_id: lead.id,
    meta: delivery_meta,
    smtp_code: codes,
    smtp_reason: reason
  }).then(r => {
    if (r.error) console.error("Error inserting delivery_event:", r.error);
  });

  // mark last send as bounced
  const { data: last } = await sb.from("send_logs")
    .select("id").eq("lead_id", lead.id).order("created_at", { ascending: false }).limit(1).maybeSingle();

  if (last?.id) {
    await sb.from("send_logs").update({
      delivery_state: 'bounced',
      delivery_meta
    }).eq("id", last.id);
  }

  // suppress on HARD or POLICY
  if (reason === "hard" || reason === "policy") {
    await sb.rpc("suppress_lead", { p_lead: lead.id, p_reason: `bounce:${reason}` }).catch(()=>{});
  }

  // Block 8850: Update lead score for bounce
  try {
    const { data: leadWithWorkspace } = await sb
      .from("leads")
      .select("workspace_id")
      .eq("id", lead.id)
      .maybeSingle();

    if (leadWithWorkspace?.workspace_id) {
      // Call scoring via edge function (fire and forget)
      await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/lead-score-v1`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({
          lead_id: lead.id,
          event_type: "bounce",
          workspace_id: leadWithWorkspace.workspace_id,
        }),
      }).catch((err) => {
        console.error("Failed to update lead score for bounce:", err);
      });
    }
  } catch (err) {
    console.error("Error updating lead score for bounce:", err);
  }
}

async function pollGmail(account:any, sinceISO:string) {
  const access = await ensureAccessToken(account.id);
  const q = `newer_than:7d subject:{Mail Delivery Subsystem} OR subject:{Delivery Status Notification} OR subject:{Undelivered}`;
  const listURL = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(q)}&maxResults=50`;

  const lres = await fetch(listURL, { headers: { Authorization: `Bearer ${access}` } });
  const ljson = await lres.json();

  for (const m of ljson.messages ?? []) {
    const mres = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=full`, { headers: { Authorization: `Bearer ${access}` } });
    const msg = await mres.json();
    const headers = Object.fromEntries((msg.payload?.headers ?? []).map((h:any)=>[h.name.toLowerCase(), h.value]));
    const subject = headers['subject'] ?? '';
    const date = headers['date'] ? new Date(headers['date']).toISOString() : new Date().toISOString();
    const from = headers['from'] ?? '';
    const fromEmail = (from.match(/<([^>]+)>/)?.[1] ?? from).trim();

    // extract text/html
    const parts = msg.payload?.parts ?? [];
    const html = (parts.find((p:any)=>p.mimeType==='text/html')?.body?.data) || msg.payload?.body?.data || "";
    const text = (parts.find((p:any)=>p.mimeType==='text/plain')?.body?.data) || "";
    const decode = (s:string)=> s ? decodeURIComponent(escape(atob(s.replace(/-/g,'+').replace(/_/g,'/')))) : "";
    const htmlDec = decode(html); const textDec = decode(text);

    // try to find the original failed recipient in body
    const mTo = (htmlDec + " " + textDec).match(/Original-Recipient:.*?([^ <>\r\n]+@[^ <>\r\n]+)/i)
             || (htmlDec + " " + textDec).match(/Final-Recipient:.*?([^ <>\r\n]+@[^ <>\r\n]+)/i)
             || (htmlDec + " " + textDec).match(/to\s*:\s*([^ <>\r\n]+@[^ <>\r\n]+)/i);
    const toEmail = mTo?.[1]?.replace(/;$/, "") || "";

    if (toEmail) {
      await handleBounce({ account, subject, html: htmlDec, text: textDec, fromEmail, toEmail, receivedAt: date });
    }
  }
}

async function pollOutlook(account:any, sinceISO:string) {
  const access = await ensureAccessToken(account.id);
  const url = `https://graph.microsoft.com/v1.0/me/mailFolders/Inbox/messages?$top=50&$orderby=receivedDateTime desc&$search=${encodeURIComponent('"Mail delivery" OR "Delivery Status Notification" OR "Undelivered"')}`;
  const lres = await fetch(url, { headers: { Authorization: `Bearer ${access}`, "ConsistencyLevel":"eventual" } });
  const j = await lres.json();
  for (const msg of j.value ?? []) {
    const subject = msg.subject || "";
    const fromEmail = msg.from?.emailAddress?.address || "";
    const date = msg.receivedDateTime || new Date().toISOString();
    const html = msg.body?.content || "";
    const text = ""; // Graph often omits plain text
    const mTo = html.match(/Final-Recipient:.*?([^ <>\r\n]+@[^ <>\r\n]+)/i)
             || html.match(/to\s*:\s*([^ <>\r\n]+@[^ <>\r\n]+)/i);
    const toEmail = mTo?.[1] || "";
    if (toEmail) {
      await handleBounce({ account, subject, html, text, fromEmail, toEmail, receivedAt: date });
    }
  }
}

Deno.serve(async (req) => {
  try {
    const { account_id } = (await req.json().catch(()=> ({}))) ?? {};
    const sinceISO = new Date(Date.now() - 7*24*3600*1000).toISOString();

    if (account_id) {
      const { data: acc } = await sb.from("connected_accounts").select("*").eq("id", account_id).maybeSingle();
      if (!acc) throw new Error("account not found");
      if (acc.provider === 'gmail') await pollGmail(acc, sinceISO);
      else if (acc.provider === 'outlook') await pollOutlook(acc, sinceISO);
      else throw new Error("unsupported provider");
      return new Response(JSON.stringify({ ok: true }), { headers: { "content-type":"application/json" } });
    }

    const { data: accounts } = await sb.from("connected_accounts").select("*");
    for (const acc of accounts ?? []) {
      try {
        if (acc.provider === 'gmail') await pollGmail(acc, sinceISO);
        else if (acc.provider === 'outlook') await pollOutlook(acc, sinceISO);
      } catch(_) {}
    }
    return new Response(JSON.stringify({ ok: true }), { headers: { "content-type":"application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok:false, error: String(e) }), { status: 500, headers: { "content-type":"application/json" } });
  }
});

