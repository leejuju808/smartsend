// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { makeSb, getAccessToken } from "../_shared/oauth.ts";
import { rateConsume } from "../_shared/rate.ts";

const supabase = makeSb();

// RFC 5322 builder
function buildMime({ from, to, subject, html }: { from: string; to: string; subject: string; html: string; }) {
  const boundary = "bnd_SMARTSEND_" + crypto.randomUUID();
  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ].join("\r\n");
  const body = [
    `--${boundary}`,
    `Content-Type: text/plain; charset="UTF-8"`,
    `Content-Transfer-Encoding: 7bit`,
    ``,
    // extremely basic plain fallback
    html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
    ``,
    `--${boundary}`,
    `Content-Type: text/html; charset="UTF-8"`,
    `Content-Transfer-Encoding: 7bit`,
    ``,
    html,
    ``,
    `--${boundary}--`,
    ``
  ].join("\r\n");
  return `${headers}\r\n\r\n${body}`;
}

async function sendGmail({ account, accessToken, to, subject, html }:{
  account: any; accessToken: string; to: string; subject: string; html: string;
}) {
  const fromName = account.from_name || "";
  const fromEmail = account.from_email || account.account_email || "";
  const raw = buildMime({ from: `${fromName} <${fromEmail}>`, to, subject, html });
  
  // Gmail API requires base64url encoding
  const base64url = btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  
  const api = `https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(account.provider_user_id || "me")}/messages/send`;
  const res = await fetch(api, {
    method: "POST",
    headers: { "Authorization": `Bearer ${accessToken}`, "content-type":"application/json" },
    body: JSON.stringify({ raw: base64url })
  });
  if (res.status === 401 || res.status === 403 || res.status === 429 || res.status >= 500) {
    throw new Error(`retryable:${res.status}`);
  }
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`fatal:${res.status}:${txt}`);
  }
  const resp = await res.json();
  // Gmail returns { id, threadId }
  return { ok: true, provider_message_id: resp.id, provider_thread_id: resp.threadId };
}

async function sendOutlook({ account, accessToken, to, subject, html }:{
  account: any; accessToken: string; to: string; subject: string; html: string;
}) {
  const fromEmail = account.from_email || account.account_email || "";
  const api = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(account.provider_user_id || "me")}/sendMail`;
  const payload = {
    message: {
      subject,
      body: { contentType: "HTML", content: html },
      toRecipients: [{ emailAddress: { address: to } }],
      from: { emailAddress: { address: fromEmail } }
    },
    saveToSentItems: true
  };
  const res = await fetch(api, {
    method: "POST",
    headers: { "Authorization": `Bearer ${accessToken}`, "content-type":"application/json" },
    body: JSON.stringify(payload)
  });
  if (res.status === 401 || res.status === 403 || res.status === 429 || res.status >= 500) {
    throw new Error(`retryable:${res.status}`);
  }
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`fatal:${res.status}:${txt}`);
  }
  
  // Outlook doesn't return IDs immediately, fetch the most recent sent message
  try {
    const listRes = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(account.provider_user_id || "me")}/messages?$top=1&$orderby=sentDateTime desc&$filter=sentDateTime ge ${new Date(Date.now() - 30000).toISOString()}`,
      { headers: { "Authorization": `Bearer ${accessToken}` } });
    if (listRes.ok) {
      const listJson = await listRes.json();
      const msg = listJson.value?.[0];
      if (msg) {
        return { 
          ok: true, 
          provider_message_id: msg.internetMessageId ?? msg.id ?? null,
          provider_thread_id: msg.conversationId ?? null
        };
      }
    }
  } catch (e) {
    // If fetch fails, continue without IDs
    console.error("Failed to fetch Outlook message ID:", e);
  }
  
  return { ok: true, provider_message_id: null, provider_thread_id: null };
}

Deno.serve(async (req) => {
  try {
    const { account_id, to, subject, html } = await req.json();
    const { data: account, error } = await supabase.from("connected_accounts").select("*").eq("id", account_id).maybeSingle();
    if (error || !account) throw new Error("account not found");
    if (!to || !subject) throw new Error("to/subject required");

    const { provider, access_token } = await getAccessToken(account_id);

    const rate = await rateConsume(account_id, 1);
    if (!rate.allowed) {
      const { data: delayData, error: delayError } = await supabase.rpc("rpc_backoff_for_account", {
        p_account_id: account_id,
        p_tokens_left: rate.tokens_left,
      });

      let delaySec = 600;
      if (!delayError) {
        const rawDelay = Array.isArray(delayData) ? delayData[0] : delayData;
        const numericDelay = typeof rawDelay === "number" ? rawDelay : Number(rawDelay);
        if (Number.isFinite(numericDelay)) {
          delaySec = Math.max(0, Math.trunc(numericDelay));
        }
      }

      return new Response(
        JSON.stringify({
          ok: true,
          delayed: true,
          reason: "rate_limited",
          tokens_left: rate.tokens_left,
          delay_seconds: delaySec,
          capacity: rate.capacity,
          refill_per_sec: rate.refill_per_sec,
        }),
        { headers: { "content-type":"application/json" } }
      );
    }

    let result: any;
    if (provider === "gmail") result = await sendGmail({ account, accessToken: access_token, to, subject, html });
    else if (provider === "outlook") result = await sendOutlook({ account, accessToken: access_token, to, subject, html });
    else throw new Error("unsupported provider");

    return new Response(
      JSON.stringify({
        ok: true,
        ...result,
        tokens_left: rate.tokens_left,
        capacity: rate.capacity,
        refill_per_sec: rate.refill_per_sec,
      }),
      { headers: { "content-type":"application/json" } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ ok:false, error: String(e) }), { status: 500, headers: { "content-type":"application/json" } });
  }
});
