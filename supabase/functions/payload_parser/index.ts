// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CRON_SECRET = Deno.env.get("CRON_SECRET")!;
const SUPABASE_URL = Deno.env.get("NEXT_PUBLIC_SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const BATCH = 50;

function sb() {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
}

function header(hdrs: any[], name: string): string | undefined {
  const h = hdrs?.find((x: any) => (x.name || x.key || "").toLowerCase() === name.toLowerCase());
  return h?.value ?? h?.Value ?? undefined;
}

function parseAddresses(v?: string): string[] {
  if (!v) return [];
  return v
    .split(",")
    .map((s) => s.replace(/.*<(.+?)>.*/, "$1").trim().replace(/^mailto:/i, ""))
    .filter(Boolean);
}

function preview(text?: string, max = 280) {
  if (!text) return null;
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 3)}...` : t;
}

function guessDirection(accountEmail: string | null | undefined, fromEmail?: string) {
  if (!fromEmail || !accountEmail) return "inbound";
  return fromEmail.toLowerCase() === accountEmail.toLowerCase() ? "outbound" : "inbound";
}

function parseGmail(p: any, accountEmail?: string) {
  const id = p?.id;
  const threadId = p?.threadId;
  const hdrs = p?.payload?.headers ?? [];
  const subject = header(hdrs, "Subject") ?? null;
  const from = header(hdrs, "From") ?? null;
  const to = header(hdrs, "To") ?? null;
  const date = header(hdrs, "Date") ?? null;
  const msgId = header(hdrs, "Message-Id") ?? header(hdrs, "Message-ID") ?? null;

  const fromEmail = parseAddresses(from ?? "")[0] ?? null;
  const toEmails = parseAddresses(to ?? "");
  const sentAt = date ? new Date(date) : (p?.internalDate ? new Date(Number(p.internalDate)) : null);
  const dir = guessDirection(accountEmail, fromEmail ?? undefined);

  return {
    provider_message_id: id,
    provider_thread_id: threadId ?? null,
    internet_message_id: msgId,
    subject,
    from_email: fromEmail,
    to_emails: toEmails,
    sent_at: sentAt ? sentAt.toISOString() : null,
    direction: dir,
    body_preview: preview(subject ?? undefined),
  };
}

function parseOutlook(p: any, accountEmail?: string) {
  const id = p?.id;
  const convId = p?.conversationId ?? null;
  const subject = p?.subject ?? null;
  const fromEmail: string | null = p?.from?.emailAddress?.address ?? null;
  const toEmails: string[] = (p?.toRecipients ?? []).map((r: any) => r?.emailAddress?.address).filter(Boolean);
  const sentAt = p?.receivedDateTime ? new Date(p.receivedDateTime) : null;
  const msgId = p?.internetMessageId ?? null;

  const dir = guessDirection(accountEmail, fromEmail ?? undefined);

  return {
    provider_message_id: id,
    provider_thread_id: convId,
    internet_message_id: msgId,
    subject,
    from_email: fromEmail,
    to_emails: toEmails,
    sent_at: sentAt ? sentAt.toISOString() : null,
    direction: dir,
    body_preview: preview(subject ?? undefined),
  };
}

async function claimPayloads(limit = BATCH) {
  const client = sb();
  const { data, error } = await client
    .from("provider_message_payloads")
    .select("id,account_id,provider,provider_message_id,payload,parsed_at")
    .is("parsed_at", null)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function accountEmail(accountId: string) {
  const client = sb();
  const { data, error } = await client
    .from("connected_accounts")
    .select("email")
    .eq("id", accountId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.email as string) ?? null;
}

Deno.serve(async (req) => {
  try {
    if (CRON_SECRET && req.headers.get("x-cron-secret") !== CRON_SECRET) {
      return new Response("Unauthorized", { status: 401 });
    }

    const rows = await claimPayloads(BATCH);
    if (!rows.length) {
      return new Response(JSON.stringify({ ok: true, parsed: 0 }), {
        headers: { "content-type": "application/json" },
      });
    }

    const emailsCache = new Map<string, string | null>();

    let parsed = 0;
    for (const r of rows) {
      try {
        const preMark = await sb()
          .from("provider_message_payloads")
          .update({ parsed_at: new Date().toISOString() })
          .eq("id", r.id)
          .is("parsed_at", null)
          .select("id")
          .maybeSingle();
        if (preMark.error || !preMark.data) continue;

        const acct = r.account_id as string;
        if (!emailsCache.has(acct)) {
          emailsCache.set(acct, await accountEmail(acct));
        }
        const acctEmail = emailsCache.get(acct) ?? null;

        let nm: any;
        if (r.provider === "gmail") {
          nm = parseGmail((r as any).payload, acctEmail ?? undefined);
        } else {
          nm = parseOutlook((r as any).payload, acctEmail ?? undefined);
        }

        const insert = {
          account_id: r.account_id,
          provider: r.provider,
          provider_message_id: nm.provider_message_id,
          provider_thread_id: nm.provider_thread_id,
          internet_message_id: nm.internet_message_id,
          subject: nm.subject,
          from_email: nm.from_email,
          to_emails: nm.to_emails,
          sent_at: nm.sent_at,
          direction: nm.direction,
          body_preview: nm.body_preview,
          payload_id: r.id,
          link_status: "unlinked" as const,
        };

        const client = sb();
        const { error: upErr } = await client
          .from("normalized_messages")
          .upsert(insert, {
            onConflict: "account_id,provider,provider_message_id",
          });
        if (upErr) throw new Error(upErr.message);

        parsed++;
      } catch (e) {
        await sb()
          .from("provider_message_payloads")
          .update({
            parse_error: String((e as any)?.message ?? e).slice(0, 800),
          })
          .eq("id", r.id);
      }
    }

    return new Response(JSON.stringify({ ok: true, parsed }), {
      headers: { "content-type": "application/json" },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: String(e) }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }
});

