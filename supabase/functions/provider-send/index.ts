// supabase/functions/provider-send/index.ts
// Deploy: supabase functions deploy provider-send
// supabase/functions/provider-send/index.ts
// Deploy with: supabase functions deploy provider-send
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

async function refreshToken(row: any) {
  const url = row.provider === "gmail"
    ? "https://oauth2.googleapis.com/token"
    : "https://login.microsoftonline.com/common/oauth2/v2.0/token";

  const params = new URLSearchParams({
    client_id: Deno.env.get(row.provider === "gmail" ? "GMAIL_CLIENT_ID" : "OUTLOOK_CLIENT_ID")!,
    client_secret: Deno.env.get(row.provider === "gmail" ? "GMAIL_CLIENT_SECRET" : "OUTLOOK_CLIENT_SECRET")!,
    grant_type: "refresh_token",
    refresh_token: row.refresh_token
  });

  const res = await fetch(url, { method: "POST", body: params });
  if (!res.ok) throw new Error("token_refresh_failed");

  const data = await res.json();

  await sb.from("mail_accounts")
    .update({
      access_token: data.access_token,
      expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString()
    })
    .eq("id", row.id);

  return data.access_token as string;
}

async function sendViaGmail(acc: any, msg: any) {
  const url = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";
  const headers = [
    `To: ${msg.to}`,
    `From: ${acc.email}`,
    `Subject: ${msg.subject}`,
    ...(msg.messageId ? [`Message-ID: ${msg.messageId}`, `References: ${msg.messageId}`] : []),
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=UTF-8"
  ];

  const emailRaw = btoa([...headers, "", msg.html].join("\r\n"))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${acc.access_token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ raw: emailRaw })
  });

  if (res.status === 401 && acc.refresh_token) {
    const newToken = await refreshToken(acc);
    return sendViaGmail({ ...acc, access_token: newToken }, msg);
  }

  if (!res.ok) {
    return { ok: false, code: String(res.status), message: await res.text() };
  }

  const json = await res.json();
  let threadId = json.threadId ?? null;

  if (!threadId && json.id) {
    try {
      const metaRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${json.id}?format=metadata`, {
        headers: { Authorization: `Bearer ${acc.access_token}` }
      });
      if (metaRes.ok) {
        const meta = await metaRes.json();
        threadId = meta.threadId ?? threadId;
      }
    } catch (_err) {
      // ignore
    }
  }

  return { ok: true, provider_id: json.id, provider_thread_id: threadId };
}

async function sendViaOutlook(acc: any, msg: any) {
  const url = "https://graph.microsoft.com/v1.0/me/sendMail";
  const payload = {
    message: {
      subject: msg.subject,
      body: { contentType: "HTML", content: msg.html },
      toRecipients: [{ emailAddress: { address: msg.to } }],
      internetMessageHeaders: [
        ...(msg.messageId ? [
          { name: "Message-ID", value: msg.messageId },
          { name: "References", value: msg.messageId }
        ] : [])
      ]
    },
    saveToSentItems: "true"
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${acc.access_token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (res.status === 401 && acc.refresh_token) {
    const newToken = await refreshToken(acc);
    return sendViaOutlook({ ...acc, access_token: newToken }, msg);
  }

  if (!res.ok) {
    return { ok: false, code: String(res.status), message: await res.text() };
  }

  return { ok: true, provider_id: crypto.randomUUID(), provider_thread_id: null };
}

serve(async (req) => {
  try {
    const {
      account_id,
      sender_email,
      to,
      subject,
      html,
      queue_id,
      message_id
    } = await req.json();

    const query = sb
      .from("mail_accounts")
      .select("*")
      .eq("account_id", account_id)
      .eq("email", sender_email);

    const { data: acc, error } = await query.maybeSingle();
      
    if (error) throw error;
    if (!acc) {
      return new Response(JSON.stringify({ error: "no_mail_account" }), { status: 400 });
    }

    if (acc.status !== "active") {
      return new Response(JSON.stringify({ error: "account_paused" }), { status: 400 });
    }

    if (acc.quota_used >= acc.quota_daily) {
      return new Response(JSON.stringify({ error: "quota_exceeded" }), { status: 429 });
    }

    const domain = Deno.env.get("MESSAGE_ID_DOMAIN") ?? "m.smartsend.ai";
    const queueId = queue_id ?? null;
    let messageId = message_id ?? null;

    if (!messageId && queueId) {
      messageId = `<q_${queueId}@${domain}>`;
    }

    if (queueId && messageId) {
      const { error: mapErr } = await sb.from("send_message_ids").upsert({
        queue_id: queueId,
        account_id,
        message_id: messageId
      });
      if (mapErr) {
        console.error("send_message_ids upsert failed", { queue_id: queueId, error: mapErr.message });
      }
    }

    const result = acc.provider === "gmail"
      ? await sendViaGmail(acc, { to, subject, html, messageId })
      : await sendViaOutlook(acc, { to, subject, html, messageId });

    if (result.ok) {
      await sb
        .from("mail_accounts")
        .update({ quota_used: acc.quota_used + 1 })
        .eq("id", acc.id);

      if (queueId) {
        const { error: updateErr } = await sb.from("send_message_ids")
          .update({
            provider_msg_id: result.provider_id ?? null,
            provider_thread_id: result.provider_thread_id ?? null
          })
          .eq("queue_id", queueId);
        if (updateErr) {
          console.error("send_message_ids provider update failed", { queue_id: queueId, error: updateErr.message });
        }
      }

      return new Response(JSON.stringify(result), {
        headers: { "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify(result), { status: 400 });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: "SERVER_ERROR", detail: String(e) }),
      { status: 500 }
    );
  }
});