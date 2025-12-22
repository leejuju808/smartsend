// deno-lint-ignore-file no-explicit-any

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import OpenAI from "npm:openai";
import { createClient } from "npm:@supabase/supabase-js";

// ---------- Setup ----------
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ---------- Helpers ----------
type Label =
  | "human_reply"
  | "out_of_office"
  | "question"
  | "positive"
  | "neutral"
  | "routing"
  | "bounce";

function parseLikelyReturnDate(text: string): Date | null {
  // Basic date heuristics — good enough for v1. We’ll improve as we see real data.
  // Examples we target: “back on Nov 28”, “returning Monday”, “back 11/28”, “OOO until 2025-12-02”, “Dec 3rd”
  const candidates: RegExp[] = [
    /\b(?:return(?:ing)?|back|until|out until)\s+(?:on\s+)?((?:\d{4}-\d{1,2}-\d{1,2})|(?:\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?)|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:,\s*\d{4})?)\b/i,
    /\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:,\s*\d{4})?)\b/i,
    /\b(\d{4}-\d{1,2}-\d{1,2})\b/,
    /\b(\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?)\b/,
  ];

  for (const re of candidates) {
    const m = text.match(re);
    if (m && m[1]) {
      const raw = m[1].replace(/(st|nd|rd|th)/gi, "");
      // Try several parsers
      const tryFormats = [raw];
      // If it's MM/DD add current year if missing
      if (/^\d{1,2}[\/\-]\d{1,2}$/.test(raw)) {
        const y = new Date().getFullYear();
        tryFormats.push(`${raw}/${y}`);
        tryFormats.push(`${raw}-${y}`);
      }
      for (const s of tryFormats) {
        const d = new Date(s);
        if (!Number.isNaN(d.getTime())) return d;
      }
    }
  }

  // Rough “next weekday” handling: returning Monday/Tuesday/etc.
  const weekday = text.match(/\breturn(?:ing)?\s+(?:on\s+)?(mon|tue|wed|thu|thur|fri|sat|sun)(?:day)?\b/i);
  if (weekday) {
    const map: Record<string, number> = {
      mon: 1, tue: 2, wed: 3, thu: 4, thur: 4, fri: 5, sat: 6, sun: 0,
    };
    const target = map[weekday[1].toLowerCase()];
    const now = new Date();
    const d = new Date(now);
    const diff = (target - now.getDay() + 7) % 7 || 7; // next such weekday
    d.setDate(now.getDate() + diff);
    return d;
  }

  return null;
}

function quickOOOHeuristic(text: string) {
  const t = text.toLowerCase();
  const isOOO =
    /\bout\s+of\s+office\b/.test(t) ||
    /\booo\b/.test(t) ||
    /\baway\b/.test(t) && /\breturn\b|\bback\b|\buntil\b/.test(t) ||
    /\bauto[-\s]?reply\b/.test(t);

  let resumeAfter: Date | null = null;
  if (isOOO) resumeAfter = parseLikelyReturnDate(text);

  return { isOOO, resumeAfter };
}

// ---------- OpenAI Classifier ----------
async function classifyWithOpenAI(input: string): Promise<{ label: Label; confidence: number }> {
  const system = `You label inbound email messages from leads. 
Return a strict JSON object with keys: label (one of: human_reply, out_of_office, question, positive, neutral, routing, bounce) and confidence (0..1). 
Definitions:
- out_of_office: automated responder indicating absence.
- human_reply: human-authored reply that is not clearly positive/neutral/question/routing.
- question: the lead asks a question.
- positive: expresses interest/yes/ready to proceed.
- neutral: acknowledges, generic thanks, not clearly positive or question.
- routing: directs you to another person/department.
- bounce: delivery failure/undeliverable notice.`;

  const user = `Email text:\n"""${input.slice(0, 16000)}"""`;

  const resp = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.0,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    response_format: { type: "json_object" as const },
  });

  let label: Label = "neutral";
  let confidence = 0.55;

  try {
    const content = resp.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(content);
    if (parsed.label) label = parsed.label;
    if (typeof parsed.confidence === "number") confidence = parsed.confidence;
  } catch {
    // keep defaults
  }

  return { label, confidence };
}

// ---------- Main handler ----------
Deno.serve(async (req) => {
  try {
    const { message_id, thread_id } = await req.json().catch(() => ({ message_id: null, thread_id: null }));

    if (!message_id && !thread_id) {
      return new Response(JSON.stringify({ error: "Provide message_id or thread_id" }), { status: 400 });
    }

    // 1) Load message + thread meta
    let msg: any = null;

    if (message_id) {
      const { data, error } = await sb
        .from("normalized_messages")
        .select("id, linked_thread_id, direction, subject, text_body, html_body, raw_headers, sent_at")
        .eq("id", message_id).single();
      if (error || !data) throw new Error(`Message not found: ${error?.message ?? "unknown"}`);
      msg = data;
    } else {
      // get latest inbound for thread
      const { data, error } = await sb
        .from("normalized_messages")
        .select("id, linked_thread_id, direction, subject, text_body, html_body, raw_headers, sent_at")
        .eq("linked_thread_id", thread_id)
        .eq("direction", "inbound")
        .order("sent_at", { ascending: false })
        .limit(1).maybeSingle();
      if (error || !data) throw new Error(`No inbound message for thread: ${error?.message ?? "unknown"}`);
      msg = data;
    }

    const tId = msg.linked_thread_id as string;

    const { data: th, error: thErr } = await sb
      .from("inbox_threads")
      .select("id, campaign_id")
      .eq("id", tId)
      .single();

    if (thErr || !th) throw new Error(`Thread not found: ${thErr?.message ?? "unknown"}`);

    const emailText =
      (msg.text_body as string)?.trim() ||
      (msg.html_body as string)?.replace(/<[^>]+>/g, " ").trim() ||
      "";

    // 2) Quick OOO heuristic first (cheap)
    const { isOOO, resumeAfter } = quickOOOHeuristic(emailText);

    // 3) OpenAI classification for final label
    const { label: aiLabel, confidence } = await classifyWithOpenAI(emailText);

    // Prefer AI label; but if heuristic caught OOO and AI isn't sure, coerce to OOO with floor confidence
    let finalLabel: Label = aiLabel;
    let finalConfidence = confidence;
    let finalResumeAfter: Date | null = resumeAfter;

    if (isOOO && aiLabel !== "out_of_office") {
      finalLabel = "out_of_office";
      finalConfidence = Math.max(confidence, 0.8);
    }
    if (finalLabel === "out_of_office" && !finalResumeAfter) {
      // Sensible default: 5 days
      const d = new Date();
      d.setDate(d.getDate() + 5);
      finalResumeAfter = d;
    }

    // 4) Write classification
    const { error: insErr } = await sb.from("reply_classes").insert({
      message_id: msg.id,
      thread_id: tId,
      campaign_id: th.campaign_id,
      label: finalLabel,
      confidence: finalConfidence,
      ai_version: "v1",
    });
    if (insErr && !String(insErr.message).includes("duplicate key")) {
      throw new Error(`Insert reply_classes failed: ${insErr.message}`);
    }

    // 5) If OOO — log + pause (snooze) thread
    let oooLogId: string | null = null;
    if (finalLabel === "out_of_office") {
      const resumeISO = finalResumeAfter ? new Date(finalResumeAfter).toISOString() : null;

      const { data: logRow, error: logErr } = await sb
        .from("out_of_office_logs")
        .insert({
          thread_id: tId,
          message_id: msg.id,
          detected_phrase: "auto-detected OOO",
          resume_after: resumeISO,
          active: true,
        })
        .select("id")
        .single();

      if (logErr) throw new Error(`Insert out_of_office_logs failed: ${logErr.message}`);
      oooLogId = logRow?.id ?? null;

      // Update snoozed_until on thread
      if (resumeISO) {
        const { error: updErr } = await sb
          .from("inbox_threads")
          .update({ snoozed_until: resumeISO })
          .eq("id", tId);
        if (updErr) throw new Error(`Update snoozed_until failed: ${updErr.message}`);
      }
    }

    const resumeAfterIso = finalResumeAfter ? new Date(finalResumeAfter).toISOString() : null;

    const signatureParserUrl = Deno.env.get("SIGNATURE_PARSE_URL");
    const isInbound = String(msg.direction ?? "").toLowerCase() === "inbound";
    const humanish = !["out_of_office", "bounce"].includes(finalLabel);
    if (signatureParserUrl && isInbound && humanish) {
      await fetch(signatureParserUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message_id: msg.id }),
      }).catch(() => {});
    }

    console.log(
      JSON.stringify({
        event: "classified",
        thread_id: tId,
        message_id: msg.id,
        label: finalLabel,
        confidence: Number(finalConfidence.toFixed(2)),
        resume_after: resumeAfterIso,
      }),
    );

    return new Response(
      JSON.stringify({
        ok: true,
        thread_id: tId,
        message_id: msg.id,
        label: finalLabel,
        confidence: finalConfidence,
        resume_after: resumeAfterIso,
        ooo_log_id: oooLogId,
      }),
      { headers: { "content-type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message ?? e) }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
});
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MODEL = "gpt-4o-mini";
const MAX_JOBS = 20;

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

async function classify(body: string): Promise<string> {
  const prompt = `
You are classifying inbound cold-email replies.
Return one label: human_reply, question, positive, neutral, negative, routing, or bounce.

Email: """${body}"""`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("OPENAI_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI error: ${response.status} ${text}`);
  }

  const json = await response.json();
  const label = json.choices?.[0]?.message?.content?.trim().toLowerCase() ?? "unknown";
  return label;
}

function pickBody(msg: Record<string, any>) {
  const source =
    msg.preview_clean ??
    msg.body_preview ??
    msg.html ??
    "";
  return String(source).slice(0, 1000);
}

Deno.serve(async () => {
  const { data: jobs, error } = await supabase
    .from("ai_jobs")
    .select("id, message_id")
    .eq("status", "pending")
    .limit(MAX_JOBS);

  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  if (!jobs?.length) {
    return new Response("ok");
  }

  let processed = 0;

  for (const job of jobs) {
    const { data: claimed, error: claimError } = await supabase
      .from("ai_jobs")
      .update({ status: "processing" })
      .eq("id", job.id)
      .eq("status", "pending")
      .select("id")
      .single();

    if (claimError || !claimed) {
      await supabase
        .from("ai_jobs")
        .update({
          status: "error",
          result: { error: claimError?.message ?? "unable to claim job" },
        })
        .eq("id", job.id);
      continue;
    }

    const { data: msg, error: msgError } = await supabase
      .from("normalized_messages")
      .select("id, direction, linked_thread_id, preview_clean, body_preview, html")
      .eq("id", job.message_id)
      .single();

    if (msgError || !msg) {
      await supabase
        .from("ai_jobs")
        .update({
          status: "error",
          result: { error: msgError?.message ?? "message not found" },
        })
        .eq("id", job.id);
      continue;
    }

    try {
      const body = pickBody(msg);
      const label = await classify(body);

      await supabase
        .from("normalized_messages")
        .update({ ai_label: label, ai_confidence: 0.95 })
        .eq("id", msg.id);

      await supabase
        .from("ai_jobs")
        .update({
          status: "done",
          result: { label },
          model: MODEL,
        })
        .eq("id", job.id);

      const campaignId = msg.linked_thread_id
        ? (
            await supabase
              .from("inbox_threads")
              .select("campaign_id")
              .eq("id", msg.linked_thread_id)
              .single()
          ).data?.campaign_id ?? null
        : null;

      await supabase.from("campaign_events").insert({
        campaign_id: campaignId,
        type: "ai_label_applied",
        actor_user_id: null,
        meta: { message_id: msg.id, label },
      });

      processed += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await supabase
        .from("ai_jobs")
        .update({
          status: "error",
          result: { error: message },
        })
        .eq("id", job.id);
    }
  }

  return new Response(JSON.stringify({ ok: true, processed }), {
    headers: { "content-type": "application/json" },
  });
});


