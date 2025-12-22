// supabase/functions/classify-replies/index.ts
// Blocks 8200 + 8210 — Classify reply_events with OpenAI + suppression rules

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing Supabase env vars");
}
if (!OPENAI_API_KEY) {
  console.error("Missing OPENAI_API_KEY env var");
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

type ReplyType =
  | "positive"
  | "neutral"
  | "negative"
  | "ooh"
  | "unsubscribe"
  | "unknown";

type ReplyEvent = {
  id: string;
  subject: string | null;
  body: string | null;
  queue_id: string;
  campaign_id: string;
  from_email: string;
};

async function classifyWithOpenAI(event: ReplyEvent): Promise<ReplyType> {
  const text = `${event.subject ?? ""}\n\n${event.body ?? ""}`.trim();

  if (!text) {
    return "unknown";
  }

  const systemPrompt =
    "You are a sales email reply classifier for a cold outbound campaign. " +
    "For each reply, classify the overall intent into EXACTLY one of these categories:\n" +
    "- positive: interested, wants to talk, open to details, soft yes\n" +
    "- neutral: asking a generic question, clarifying, neither yes nor no\n" +
    "- negative: not interested, stop emailing, firm no\n" +
    "- ooh: out-of-office or automatic vacation responder\n" +
    "- unsubscribe: asking to be removed from list, unsubscribe, do not contact\n" +
    "- unknown: cannot determine\n\n" +
    "Return ONLY the label in lowercase: positive, neutral, negative, ooh, unsubscribe, or unknown.";

  const userPrompt = `Reply to classify:\n\n${text}`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 10,
    }),
  });

  if (!res.ok) {
    console.error("OpenAI error:", await res.text());
    return "unknown";
  }

  const data = await res.json();
  const content: string =
    data.choices?.[0]?.message?.content?.trim().toLowerCase() ?? "unknown";

  const allowed: ReplyType[] = [
    "positive",
    "neutral",
    "negative",
    "ooh",
    "unsubscribe",
    "unknown",
  ];

  const match = allowed.find((x) => content.includes(x));
  return match ?? "unknown";
}

/**
 * Apply suppression / reply_status rules on the queue based on replyType.
 */
async function applyQueueRules(ev: ReplyEvent, replyType: ReplyType) {
  // 0) Load org_id
  const { data: campaign, error: campErr } = await supabaseAdmin
    .from("campaigns")
    .select("org_id")
    .eq("id", ev.campaign_id)
    .maybeSingle();

  const orgId = campaign?.org_id ?? null;

  // 1) Update the specific queue row's reply_status
  const replyStatus =
    replyType === "ooh" || replyType === "unsubscribe" ? "ignore" : "replied";

  const { error: updateReplyStatusError } = await supabaseAdmin
    .from("campaign_send_queue")
    .update({
      reply_status: replyStatus,
    })
    .eq("id", ev.queue_id);

  if (updateReplyStatusError) {
    console.error("classify-replies: update reply_status error", updateReplyStatusError);
  }

  // 2) NEGATIVE + UNSUBSCRIBE = GLOBAL SUPPRESSION
  if (replyType === "unsubscribe" || replyType === "negative") {
    await supabaseAdmin.rpc("upsert_global_suppression", {
      p_org_id: orgId,
      p_email: ev.from_email,
      p_reason: replyType === "unsubscribe" ? "unsubscribe" : "negative_reply",
      p_campaign_id: ev.campaign_id,
      p_queue_id: ev.queue_id,
    });

    const suppressionReason =
      replyType === "unsubscribe"
        ? "suppressed: unsubscribe"
        : "suppressed: negative_reply";

    const { error: suppressionError } = await supabaseAdmin
      .from("campaign_send_queue")
      .update({
        status: "failed", // will no longer be picked up by the send engine
        last_error: suppressionReason,
      })
      .eq("campaign_id", ev.campaign_id)
      .eq("to_email", ev.from_email)
      .in("status", ["pending", "retry"]); // do not touch already-sent rows

    if (suppressionError) {
      console.error("classify-replies: suppression update error", suppressionError);
    }
  }
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // 1) Load a batch of unclassified / unknown replies
  const { data: events, error } = await supabaseAdmin
    .from("campaign_reply_events")
    .select("id, subject, body, queue_id, campaign_id, from_email")
    .in("reply_type", [null, "unknown"] as any)
    .order("created_at", { ascending: true })
    .limit(20);

  if (error) {
    console.error("classify-replies: fetch error", error);
    return new Response(
      JSON.stringify({ ok: false, error: "fetch_failed" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  if (!events || events.length === 0) {
    return new Response(
      JSON.stringify({ ok: true, processed: 0, message: "no pending replies" }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  const results: { id: string; reply_type: ReplyType }[] = [];

  for (const ev of events as ReplyEvent[]) {
    try {
      const replyType = await classifyWithOpenAI(ev);

      // 2) Update reply_type on the event
      const { error: updateError } = await supabaseAdmin
        .from("campaign_reply_events")
        .update({ reply_type: replyType })
        .eq("id", ev.id);

      if (updateError) {
        console.error("classify-replies: update event error", updateError);
        continue;
      }

      // 3) Apply suppression / reply_status rules on the queue
      await applyQueueRules(ev, replyType);

      results.push({ id: ev.id, reply_type: replyType });
    } catch (err) {
      console.error("classify-replies: classification error", err);
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      processed: results.length,
      results,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
});
