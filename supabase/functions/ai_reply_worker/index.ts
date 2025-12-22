// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("NEXT_PUBLIC_SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET")!;
const BATCH = 40;

function sb() {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
}

type Label =
  | "human_reply"
  | "question"
  | "positive"
  | "neutral"
  | "negative"
  | "ooo"
  | "unsubscribe"
  | "spam"
  | "bounce"
  | "other";

function needsReply(label: Label) {
  return label === "human_reply" || label === "question" || label === "positive" || label === "neutral";
}

async function claim(limit = BATCH) {
  const client = sb();
  const { data, error } = await client.rpc("exec_sql", {
    sql: `
      with c as (
        select id
        from public.ai_reply_jobs
        where status = 'queued' and run_at <= now()
        order by run_at asc
        limit ${limit}
        for update skip locked
      )
      update public.ai_reply_jobs q
         set status = 'working', attempts = attempts + 1
       where q.id in (select id from c)
       returning q.*
    `,
  });
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function getText(row: any) {
  const client = sb();
  // prefer cleaned body; else preview
  const { data: body } = await client
    .from("message_bodies")
    .select("clean_text, body_html")
    .eq("account_id", row.account_id)
    .eq("provider", row.provider)
    .eq("provider_message_id", row.provider_message_id)
    .maybeSingle();

  const { data: nm } = await client
    .from("normalized_messages")
    .select("preview_clean, subject, sent_at, linked_thread_id")
    .eq("id", row.normalized_id)
    .maybeSingle();

  const text =
    body?.clean_text ??
    (body?.body_html ? body.body_html.replace(/<[^>]+>/g, " ") : null) ??
    nm?.preview_clean ??
    "";
  return {
    text,
    thread_id: nm?.linked_thread_id as string | undefined,
    sent_at: nm?.sent_at as string | undefined,
    subject: nm?.subject as string | undefined,
  };
}

async function classify(text: string, subject?: string) {
  const prompt = `
Classify the email reply. Output strict JSON: {"label":"<one>","confidence":0.0}

Labels:

- human_reply (a human wrote a real message that merits a response)
- question (explicit question to answer)
- positive (positive response like "sounds good", "interested")
- neutral (non-negative human reply, no clear sentiment)
- negative (rejecting)
- ooo (out-of-office/auto-responder)
- unsubscribe (requests to stop emailing)
- spam (promos, newsletters not from the lead)
- bounce (undeliverable notices)
- other


Rules:
- If it’s an automated notice (OOO/bounce), do NOT mark as human_reply.
- Prefer unsubscribe if explicit.

Text:
SUBJECT: ${subject ?? ""}
BODY: ${text.slice(0, 4000)}
`.trim();

  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${OPENAI_KEY}` },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a strict email labeler." },
        { role: "user", content: prompt },
      ],
      temperature: 0,
      response_format: { type: "json_object" },
    }),
  });
  if (!r.ok) throw new Error(await r.text());
  const j = await r.json();
  const parsed = JSON.parse(j.choices?.[0]?.message?.content ?? `{"label":"other","confidence":0}`);
  return { label: (parsed.label || "other") as Label, confidence: Number(parsed.confidence ?? 0) };
}

async function complete(row: any, label: Label, conf: number, opts: { thread_id?: string; sent_at?: string }) {
  const client = sb();
  // write label to normalized (source of truth for inbound)
  await client
    .from("normalized_messages")
    .update({
      ai_label: label,
      ai_confidence: conf,
    })
    .eq("id", row.normalized_id);

  await client
    .from("inbox_messages")
    .update({
      ai_label: label,
      ai_confidence: conf,
    })
    .eq("account_id", row.account_id)
    .eq("provider", row.provider)
    .eq("provider_message_id", row.provider_message_id);

  // auto-mark thread
  if (opts.thread_id) {
    const markNeeds = needsReply(label);
    await client.rpc("mark_thread_reply", {
      p_thread: opts.thread_id,
      p_when: opts.sent_at ?? new Date().toISOString(),
      p_needs_reply: markNeeds,
    });
  }

  // autopause/suppress niceties (optional): unsubscribe → pause lead
  if (label === "unsubscribe") {
    // If you track campaign_leads.status, flip to 'unsub' where possible.
    // This is optional and safe to skip if schema differs.
    await client
      .rpc("exec_sql", {
        sql: `
      update public.campaign_leads cl
      set status = 'unsub'
      where (cl.campaign_id, cl.lead_id) in (
        select t.campaign_id, t.lead_id
        from public.inbox_threads t
        join public.normalized_messages nm on nm.linked_thread_id = t.id
        where nm.id = '${row.normalized_id}'::uuid
      )
    `,
      })
      .catch(() => {});
  }

  await client
    .from("ai_reply_jobs")
    .update({ status: "done", error: null })
    .eq("id", row.id);
}

async function fail(row: any, err: any) {
  const client = sb();
  const msg = typeof err === "string" ? err : err?.message ?? JSON.stringify(err);
  const attempts = row.attempts ?? 0;
  const dead = attempts >= 5 ? "dead" : "failed";
  const delayMinutes = attempts === 0 ? 1 : attempts === 1 ? 5 : attempts === 2 ? 15 : 60;
  const nextAt = new Date(Date.now() + delayMinutes * 60 * 1000).toISOString();
  await client
    .from("ai_reply_jobs")
    .update({ status: dead, error: msg, run_at: nextAt })
    .eq("id", row.id);
}

Deno.serve(async (req) => {
  if (CRON_SECRET && req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const jobs = await claim();
    await Promise.all(
      jobs.map(async (row: any) => {
        try {
          const { text, thread_id, sent_at, subject } = await getText(row);
          const { label, confidence } = await classify(text, subject);
          await complete(row, label, confidence, { thread_id, sent_at });
        } catch (e) {
          await fail(row, e);
        }
      }),
    );
    return new Response(JSON.stringify({ ok: true, claimed: jobs.length }), {
      headers: { "content-type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
});


