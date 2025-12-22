// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL =
  Deno.env.get("SUPABASE_URL") ?? Deno.env.get("NEXT_PUBLIC_SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

type Provider = "gmail" | "outlook";

async function upsertProviderMessage(row: {
  provider: Provider;
  provider_message_id: string;
  provider_thread_id: string | null;
  internet_message_id?: string | null;
  from_email?: string | null;
  to_emails?: string[] | null;
  subject?: string | null;
  snippet?: string | null;
  received_at?: string | null;
  payload?: any;
}) {
  const { error } = await supabase.from("provider_messages").insert({
    ...row,
    internet_message_id: row.internet_message_id ?? null,
    provider_thread_id: row.provider_thread_id ?? null,
  });

  if (error && error.code !== "23505") {
    throw error;
  }
}

function headerValue(headers: any[], name: string): string | null {
  return (
    headers?.find(
      (h) => typeof h?.name === "string" && h.name.toLowerCase() === name.toLowerCase()
    )?.value ?? null
  );
}

function parseAddress(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = value.match(/<([^>]+)>/);
  if (match?.[1]) return match[1].trim().toLowerCase();
  return value.trim().toLowerCase();
}

function splitRecipients(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => parseAddress(s) ?? "")
    .filter(Boolean);
}

function decodeBase64(body: string): string {
  try {
    const normalized = body.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = atob(normalized);
    const bytes = Uint8Array.from(decoded, (c) => c.charCodeAt(0));
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  } catch {
    return "";
  }
}

function extractGmailBody(payload: any): { html: string; text: string } {
  const parts = payload?.parts ?? [];
  let html = "";
  let text = "";

  const walk = (part: any) => {
    if (!part) return;
    if (part.mimeType === "text/html" && part.body?.data) {
      html += decodeBase64(part.body.data);
    } else if (part.mimeType === "text/plain" && part.body?.data) {
      text += decodeBase64(part.body.data);
    } else if (part.parts?.length) {
      part.parts.forEach(walk);
    } else if (part.body?.data) {
      text += decodeBase64(part.body.data);
    }
  };

  walk(payload);

  if (!html && text) {
    html = `<pre>${text}</pre>`;
  }

  return { html, text };
}

async function ensureThreadLink(
  provider: Provider,
  providerThreadId: string | null,
  campaignId: string,
  fromEmail: string
) {
  const sanitizedProviderThreadId =
    providerThreadId ?? `msg:${fromEmail}:${Date.now()}`;
  const { data: existing } = await supabase
    .from("thread_links")
    .select("thread_id")
    .eq("provider", provider)
    .eq("provider_thread_id", sanitizedProviderThreadId)
    .maybeSingle();

  if (existing?.thread_id) {
    return existing.thread_id as string;
  }

  const { data: threadId, error } = await supabase.rpc("ensure_thread_for_email", {
    p_campaign: campaignId,
    p_email: fromEmail,
  });

  if (error || !threadId) {
    throw error ?? new Error("thread_creation_failed");
  }

  await supabase
    .from("thread_links")
    .upsert(
      {
        campaign_id: campaignId,
        provider,
        provider_thread_id: sanitizedProviderThreadId,
        thread_id: threadId as string,
      },
      { onConflict: "provider,provider_thread_id" }
    );

  const { data: thread } = await supabase
    .from("inbox_threads")
    .select("id, lead_id")
    .eq("id", threadId as string)
    .maybeSingle();

  return {
    threadId: threadId as string,
    leadId: thread?.lead_id ?? null,
  };
}

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    const provider = payload.provider as Provider;
    const email = payload.email as string;
    const messageId = payload.id as string;

    if (!provider || !email || !messageId) {
      return new Response(
        JSON.stringify({ error: "missing_fields" }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }

    const { data: account } = await supabase
      .from("mail_accounts")
      .select("*")
      .eq("provider", provider)
      .eq("email", email)
      .maybeSingle();

    if (!account) {
      return new Response(
        JSON.stringify({ error: "account_not_found" }),
        { status: 404, headers: { "content-type": "application/json" } }
      );
    }

    let meta: any = {};
    if (provider === "gmail") {
      const res = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
        { headers: { Authorization: `Bearer ${account.access_token}` } }
      );
      meta = await res.json();
    } else {
      const res = await fetch(
        `https://graph.microsoft.com/v1.0/me/messages/${messageId}`,
        { headers: { Authorization: `Bearer ${account.access_token}` } }
      );
      meta = await res.json();
    }

    if (!meta || meta.error) {
      return new Response(
        JSON.stringify({ error: "provider_fetch_failed", detail: meta?.error ?? null }),
        { status: 502, headers: { "content-type": "application/json" } }
      );
    }

    let fromHeader: string | null = null;
    let toHeader: string | null = null;
    let subject: string | null = null;
    let internetId: string | null = null;
    let snippet: string | null = null;
    let receivedAt: string | null = null;
    let providerThreadId: string | null = null;

    if (provider === "gmail") {
      const headers = meta.payload?.headers ?? [];
      fromHeader = headerValue(headers, "From");
      toHeader = headerValue(headers, "To");
      subject = headerValue(headers, "Subject");
      internetId = headerValue(headers, "Message-ID");
      snippet = meta.snippet ?? null;
      receivedAt = meta.internalDate ? new Date(Number(meta.internalDate)).toISOString() : new Date().toISOString();
      providerThreadId = meta.threadId ?? payload.threadId ?? null;
    } else {
      fromHeader = meta.from?.emailAddress?.address ?? null;
      toHeader = (meta.toRecipients ?? [])
        .map((r: any) => r?.emailAddress?.address)
        .filter(Boolean)
        .join(", ");
      subject = meta.subject ?? null;
      internetId = meta.internetMessageId ?? null;
      snippet = meta.bodyPreview ?? null;
      receivedAt = meta.receivedDateTime ?? new Date().toISOString();
      providerThreadId = meta.conversationId ?? payload.conversationId ?? null;
    }

    const fromEmail = parseAddress(fromHeader ?? "") ?? "";
    const toEmails = splitRecipients(toHeader);
    const { html, text } =
      provider === "gmail"
        ? extractGmailBody(meta.payload)
        : (() => {
            const bodyContent = meta.body?.content ?? "";
            if (meta.body?.contentType === "html") {
              return { html: bodyContent, text: meta.bodyPreview ?? "" };
            }
            return { html: "", text: bodyContent || meta.bodyPreview || "" };
          })();

    await upsertProviderMessage({
      provider,
      provider_message_id: messageId,
      provider_thread_id: providerThreadId,
      internet_message_id: internetId,
      from_email: fromEmail,
      to_emails: toEmails,
      subject,
      snippet,
      received_at: receivedAt,
      payload: meta,
    });

    const campaignId = Deno.env.get("CURRENT_CAMPAIGN_ID");
    if (!campaignId) {
      return new Response(
        JSON.stringify({ error: "missing_campaign_context" }),
        { status: 500, headers: { "content-type": "application/json" } }
      );
    }

    const { threadId, leadId } = await ensureThreadLink(
      provider,
      providerThreadId,
      campaignId,
      fromEmail
    );

    const { error: insertError } = await supabase
      .from("inbox_messages")
      .insert({
        thread_id: threadId,
        campaign_id: campaignId,
        lead_id: leadId,
        direction: "inbound",
        provider,
        provider_message_id: messageId,
        provider_thread_id: providerThreadId,
        subject,
        snippet: snippet ?? null,
        body_html: html || null,
        body_text: text || snippet || subject || "(no content)",
        from_email: fromEmail,
        to_email: toEmails?.[0] ?? null,
        received_at: receivedAt,
      });

    if (insertError && insertError.code !== "23505") {
      throw insertError;
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (error) {
    console.error("ingest-mail error", error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
});

