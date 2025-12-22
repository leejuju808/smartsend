// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const URL = Deno.env.get("NEXT_PUBLIC_SUPABASE_URL")!;
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET")!;

function sb() {
  return createClient(URL, KEY, { auth: { persistSession: false } });
}

// --- OAuth refresh helpers ---------------------------------------------------
async function refreshGmail(account: any) {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GOOGLE_CLIENT_ID")!,
      client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
      grant_type: "refresh_token",
      refresh_token: account.refresh_token!,
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error_description || j.error || "gmail refresh failed");
  return { access_token: j.access_token, expires_in: j.expires_in };
}

async function refreshOutlook(account: any) {
  const r = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("MS_CLIENT_ID")!,
      client_secret: Deno.env.get("MS_CLIENT_SECRET")!,
      grant_type: "refresh_token",
      refresh_token: account.refresh_token!,
      scope: "https://graph.microsoft.com/.default offline_access",
      redirect_uri: Deno.env.get("MS_REDIRECT_URI")!,
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error_description || j.error || "outlook refresh failed");
  return { access_token: j.access_token, expires_in: j.expires_in };
}

async function ensureAccessToken(acc: any) {
  const exp = acc.expires_at ? new Date(acc.expires_at).getTime() : 0;
  const needs = !acc.access_token || exp - Date.now() < 5 * 60 * 1000;
  if (!needs) return acc.access_token as string;

  let tok: { access_token: string; expires_in: number };
  if (acc.provider === "gmail") tok = await refreshGmail(acc);
  else if (acc.provider === "outlook") tok = await refreshOutlook(acc);
  else throw new Error("unknown provider");

  const newExp = new Date(Date.now() + (tok.expires_in - 60) * 1000).toISOString();
  await sb()
    .from("connected_accounts")
    .update({ access_token: tok.access_token, expires_at: newExp })
    .eq("id", acc.id);

  return tok.access_token;
}

// --- Rate budget helper ------------------------------------------------------
async function checkBudget(account_id: string) {
  const client = sb();
  const { data: budget } = await client
    .from("send_rate_budgets")
    .select("*")
    .eq("account_id", account_id)
    .maybeSingle();
  return budget ?? { daily_quota: 1800, hourly_quota: 200, burst: 20 };
}

// --- Provider senders --------------------------------------------------------
async function sendGmail(accessToken: string, fromEmail: string, toEmail: string, subject: string, html: string) {
  const raw = btoa(
    `From: ${fromEmail}\r\n` +
      `To: ${toEmail}\r\n` +
      `Subject: ${subject}\r\n` +
      `Content-Type: text/html; charset=utf-8\r\n\r\n` +
      html,
  );
  const r = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ raw }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`gmail ${r.status}: ${j.error?.message || "send failed"}`);
  return j;
}

async function sendOutlook(accessToken: string, fromEmail: string, toEmail: string, subject: string, html: string) {
  const r = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      message: {
        subject,
        body: { contentType: "HTML", content: html },
        toRecipients: [{ emailAddress: { address: toEmail } }],
        from: { emailAddress: { address: fromEmail } },
      },
      saveToSentItems: true,
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`outlook ${r.status}: ${j.error?.message || "send failed"}`);
  return j;
}

// --- Queue helpers -----------------------------------------------------------
async function claim(limit = 25) {
  const { data, error } = await sb().rpc("claim_send_queue", { p_limit: limit });
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function loadContext(row: any) {
  const client = sb();
  const [{ data: draft }, { data: thread }] = await Promise.all([
    client
      .from("reply_drafts")
      .select("subject, body_html, lead_id")
      .eq("id", row.draft_id)
      .maybeSingle(),
    client
      .from("inbox_threads")
      .select("account_id")
      .eq("id", row.thread_id)
      .maybeSingle(),
  ]);

  const threadAccountId = thread?.account_id ?? row.account_id ?? null;
  let account: any = null;
  if (threadAccountId) {
    const { data: acc } = await client
      .from("connected_accounts")
      .select("id, provider, email, access_token, refresh_token, expires_at")
      .eq("id", threadAccountId)
      .maybeSingle();
    account = acc;
  }

  const { data: lead } = await client
    .from("leads")
    .select("email")
    .eq("id", row.lead_id)
    .maybeSingle();

  return {
    draft,
    account,
    toEmail: lead?.email ?? null,
  };
}

async function logAttempt(
  queueId: string,
  provider: string,
  accountId: string | null,
  result: string,
  status_code?: number,
  message?: string,
) {
  await sb().from("send_attempts").insert({
    queue_id: queueId,
    provider,
    account_id: accountId,
    result,
    status_code: status_code ?? null,
    message: message ?? null,
  });
}

async function processOne(row: any) {
  const client = sb();
  const { draft, account, toEmail } = await loadContext(row);

  if (!draft || !account || !toEmail) {
    await logAttempt(row.id, account?.provider ?? "unknown", account?.id ?? null, "soft", undefined, "missing context");
    await client.rpc("finish_send", { queue: row.id, ok: false, err: "missing context", delay_minutes: 15 });
    return;
  }

  await checkBudget(account.id); // placeholder hook for future counters

  let token: string;
  try {
    token = await ensureAccessToken(account);
  } catch (e: any) {
    await logAttempt(row.id, account.provider, account.id, "eoauth", 401, e?.message);
    await client.rpc("finish_send", { queue: row.id, ok: false, err: "oauth", delay_minutes: 30 });
    return;
  }

  try {
    if (account.provider === "gmail") {
      await sendGmail(token, account.email, toEmail, draft.subject, draft.body_html);
    } else if (account.provider === "outlook") {
      await sendOutlook(token, account.email, toEmail, draft.subject, draft.body_html);
    } else {
      throw new Error("unsupported provider");
    }

    await logAttempt(row.id, account.provider, account.id, "ok", 200, "sent");
    await client.rpc("finish_send", { queue: row.id, ok: true });
  } catch (e: any) {
    const msg = e?.message || String(e);
    const isRate = /rate|quota|429|Too Many/i.test(msg);
    const isSoft = /5\d\d|timeout|temporar/i.test(msg);
    const delay = isRate ? 15 : isSoft ? 5 : null;

    await logAttempt(row.id, account.provider, account.id, isRate ? "rate" : isSoft ? "soft" : "hard", undefined, msg);
    await client.rpc("finish_send", {
      queue: row.id,
      ok: false,
      err: msg,
      delay_minutes: delay,
    });
  }
}

Deno.serve(async (req) => {
  if (CRON_SECRET && req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  const url = new URL(req.url);
  const limit = Number(url.searchParams.get("limit") ?? "20");
  let processed = 0;

  const jobs = await claim(limit);
  for (const j of jobs) {
    await processOne(j);
    processed++;
  }

  return new Response(JSON.stringify({ ok: true, processed }), {
    headers: { "content-type": "application/json" },
  });
});

