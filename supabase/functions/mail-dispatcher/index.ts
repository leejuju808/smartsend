// deno
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sb = createClient(SB_URL, SB_KEY);

serve(async () => {
  const nowIso = new Date().toISOString();

  const { data: jobs, error } = await sb
    .from("outbox_requests")
    .select(
      "id,thread_id,campaign_id,lead_id,draft_id,subject,body,from_email,to_email,run_at,status,attempts",
    )
    .eq("status", "queued")
    .lte("run_at", nowIso)
    .order("run_at", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(20);

  if (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500 },
    );
  }

  if (!jobs?.length) {
    return new Response(
      JSON.stringify({ ok: true, processed: 0 }),
      { headers: { "Content-Type": "application/json" } },
    );
  }

  let processed = 0;

  for (const j of jobs) {
    try {
      const { data: acct } = await sb.from("connected_accounts")
        .select(
          "id,provider,access_token,refresh_token,expires_at,email,meta",
        )
        .eq("email", j.from_email)
        .limit(1)
        .maybeSingle();

      if (!acct) {
        await fail(j.id, "No connected account for from_email");
        continue;
      }

      const { data: delay } = await sb.rpc("acquire_send_permit", {
        p_account: acct.id,
        p_from_email: j.from_email,
      });

      if ((delay ?? 0) > 0) {
        await sb.from("outbox_requests").update({
          run_at: new Date(Date.now() + (delay! * 1000)).toISOString(),
        }).eq("id", j.id);
        continue;
      }

      await sb.from("outbox_requests").update({
        status: "sending",
        attempts: (j.attempts ?? 0) + 1,
      }).eq("id", j.id);

      const token = await refreshIfNeeded(acct);

      const { bodyText, providerResult, providerName } = await actuallySend(
        acct,
        j,
        token,
      );

      await markSentAndBackfill(
        sb,
        j,
        providerName,
        providerResult,
        bodyText,
      );

      processed++;
    } catch (e) {
      const msg = String(e);
      const isThrottle = /429|throttle|throttled|rate|quota|403/.test(
        msg.toLowerCase(),
      );

      if (isThrottle) {
        const acctId = await accountIdForEmail(sb, j.from_email);
        if (acctId) {
          await sb.rpc("penalize_account", { p_account: acctId });
        }

        const backoffSec = computeBackoff(j.attempts ?? 0);
        await sb.from("outbox_requests")
          .update({
            status: "queued",
            run_at: new Date(Date.now() + backoffSec * 1000).toISOString(),
            last_error: msg,
          })
          .eq("id", j.id);

        await sb.from("delivery_events").insert({
          thread_id: j.thread_id,
          campaign_id: j.campaign_id,
          lead_id: j.lead_id,
          provider: null,
          provider_message_id: null,
          event: "throttled",
          meta: { error: msg, backoff_sec: backoffSec },
        });
      } else {
        await fail(j.id, msg);
        await sb.from("delivery_events").insert({
          thread_id: j.thread_id,
          campaign_id: j.campaign_id,
          lead_id: j.lead_id,
          provider: null,
          provider_message_id: null,
          event: "rejected",
          meta: { error: msg },
        });
      }
    }
  }

  return new Response(
    JSON.stringify({ ok: true, processed }),
    { headers: { "Content-Type": "application/json" } },
  );
});

async function refreshIfNeeded(acct: any): Promise<string> {
  const exp = acct.expires_at ? new Date(acct.expires_at).getTime() : 0;
  const now = Date.now() + 60_000;

  if (exp > now) return acct.access_token;

  const tokenUrl = acct.provider === "gmail"
    ? "https://oauth2.googleapis.com/token"
    : "https://login.microsoftonline.com/common/oauth2/v2.0/token";

  const clientId = Deno.env.get(
    acct.provider === "gmail" ? "GMAIL_CLIENT_ID" : "MS_CLIENT_ID",
  )!;
  const clientSecret = Deno.env.get(
    acct.provider === "gmail" ? "GMAIL_CLIENT_SECRET" : "MS_CLIENT_SECRET",
  )!;

  const form = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: acct.refresh_token,
  });

  const res = await fetch(tokenUrl, { method: "POST", body: form });

  if (!res.ok) {
    throw new Error(`refresh failed: ${res.status}`);
  }

  const j = await res.json();
  const newExp = j.expires_in
    ? new Date(Date.now() + j.expires_in * 1000).toISOString()
    : null;

  await sb.from("connected_accounts").update({
    access_token: j.access_token,
    expires_at: newExp,
  }).eq("id", acct.id);

  return j.access_token as string;
}

async function actuallySend(acct: any, job: any, token: string) {
  let providerResult: { id?: string; providerId?: string | null } = {};
  let bodyText = job.body;

  if (acct.provider === "gmail") {
    providerResult = await sendGmail(
      token,
      job.from_email!,
      job.to_email!,
      job.subject,
      job.body,
    );
  } else if (acct.provider === "outlook") {
    providerResult = await sendOutlook(
      token,
      job.from_email!,
      job.to_email!,
      job.subject,
      job.body,
    );
  } else {
    throw new Error(`Unsupported provider: ${acct.provider}`);
  }

  return {
    bodyText,
    providerResult,
    providerName: acct.provider,
  };
}

async function markSentAndBackfill(
  sb: any,
  job: any,
  providerName: string,
  providerResult: { id?: string; providerId?: string | null },
  bodyText: string,
) {
  const providerMessageId = providerResult.providerId ??
    providerResult.id ?? null;
  const sentAt = new Date().toISOString();

  await sb.from("outbox_requests").update({
    status: "sent",
    provider: providerName,
    provider_message_id: providerMessageId,
    sent_at: sentAt,
  }).eq("id", job.id);

  await sb.from("delivery_events").insert({
    thread_id: job.thread_id,
    campaign_id: job.campaign_id,
    lead_id: job.lead_id,
    provider: providerName,
    provider_message_id: providerMessageId,
    event: "accepted",
    meta: {},
  });

  await sb.from("normalized_messages").insert({
    id: crypto.randomUUID(),
    linked_thread_id: job.thread_id,
    direction: "outbound",
    ai_label: null,
    subject: job.subject,
    body: bodyText,
    sent_at: sentAt,
    sender_email: job.from_email,
    recipient_email: job.to_email,
    meta: {
      source: "provider",
      provider: providerName,
      provider_message_id: providerMessageId,
    },
  });
}

function makeRfc822(
  fromEmail: string,
  toEmail: string,
  subject: string,
  body: string,
): string {
  const lines = [
    `From: ${fromEmail}`,
    `To: ${toEmail}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "",
    body,
  ];

  return lines.join("\r\n");
}

async function sendGmail(
  accessToken: string,
  fromEmail: string,
  toEmail: string,
  subject: string,
  body: string,
) {
  const raw = base64Url(makeRfc822(fromEmail, toEmail, subject, body));

  const res = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw }),
    },
  );

  if (res.status === 429 || res.status === 403) {
    throw new Error("gmail throttled");
  }

  if (!res.ok) {
    throw new Error(`gmail send failed ${res.status}`);
  }

  const j = await res.json();
  return { id: j.id, providerId: j.id };
}

async function sendOutlook(
  accessToken: string,
  _fromEmail: string,
  toEmail: string,
  subject: string,
  body: string,
) {
  const res = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: {
        subject,
        body: { contentType: "Text", content: body },
        toRecipients: [{ emailAddress: { address: toEmail } }],
      },
      saveToSentItems: true,
    }),
  });

  if (res.status === 429 || res.status === 403) {
    throw new Error("outlook throttled");
  }

  if (!res.ok) {
    throw new Error(`outlook send failed ${res.status}`);
  }

  return { id: crypto.randomUUID(), providerId: null };
}

function computeBackoff(attempts: number) {
  const base = 30;
  const max = 15 * 60;
  const jitter = Math.floor(Math.random() * 10);
  return Math.min(max, base * Math.pow(2, Math.min(attempts, 5)) + jitter);
}

async function fail(id: string, msg: string) {
  await sb.from("outbox_requests").update({
    status: "failed",
    last_error: msg,
  }).eq("id", id);
}

async function accountIdForEmail(sb: any, email: string) {
  const { data } = await sb.from("connected_accounts")
    .select("id")
    .eq("email", email)
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

function base64Url(str: string): string {
  const b = btoa(unescape(encodeURIComponent(str)));
  return b.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

