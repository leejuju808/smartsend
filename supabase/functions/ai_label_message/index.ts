import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing Supabase service role configuration");
}

if (!OPENAI_API_KEY) {
  throw new Error("Missing OPENAI_API_KEY environment variable");
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const LLM_ENDPOINT = "https://api.openai.com/v1/chat/completions";
const THREAD_INTEL_URL = Deno.env.get("THREAD_INTEL_URL") ??
  (SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/thread-intel` : undefined);

type Payload = { message_id: string };

async function classify(subject: string, body: string): Promise<string> {
  const systemPrompt = `You are an email triager. Label the lead's email with one of:
- positive (they're saying yes or interested)
- question (they're asking a question or for more info)
- neutral (acknowledgement, generic reply)
- unsubscribe (unsubscribe/stop/opt-out sentiment)
- oOO (out-of-office or auto-reply)
- bounce (delivery failure notice)
- spam (irrelevant spam)

Return ONLY the label word.`;

  const userPrompt = `Subject: ${subject}\n\nBody:\n${body}`;

  const res = await fetch(LLM_ENDPOINT, {
    method: "POST",
    headers: {
      authorization: `Bearer ${OPENAI_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`LLM classify failed: ${res.status} ${text}`);
  }

  const json = await res.json();
  const rawLabel = (json?.choices?.[0]?.message?.content ?? "").trim().toLowerCase();
  return rawLabel;
}

function normalizeLabel(label: string): "positive" | "question" | "neutral" | "unsubscribe" | "oOO" | "bounce" | "spam" {
  const normalized = label.trim().toLowerCase();
  if (normalized === "ooo" || normalized === "out-of-office" || normalized === "out of office") {
    return "oOO";
  }
  switch (normalized) {
    case "positive":
      return "positive";
    case "question":
      return "question";
    case "neutral":
      return "neutral";
    case "unsubscribe":
      return "unsubscribe";
    case "bounce":
      return "bounce";
    case "spam":
      return "spam";
    default:
      return "neutral";
  }
}

async function applyUnsubscribe(threadId: string, leadId: string | null, campaignId: string | null, messageId: string) {
  if (leadId && campaignId) {
    await sb
      .from("campaign_leads")
      .update({ status: "unsub" })
      .eq("lead_id", leadId)
      .eq("campaign_id", campaignId);

    await sb.from("reply_events").insert({
      thread_id: threadId,
      lead_id: leadId,
      campaign_id: campaignId,
      message_id: messageId,
      kind: "unsubscribe",
      meta: { detected_by: "ai_label_message" },
    });
  }
}

async function applyOoo(threadId: string, leadId: string | null, campaignId: string | null, messageId: string) {
  if (leadId && campaignId) {
    await sb.from("reply_events").insert({
      thread_id: threadId,
      lead_id: leadId,
      campaign_id: campaignId,
      message_id: messageId,
      kind: "oOO",
    });
  }
}

async function applyBounce(threadId: string, leadId: string | null, campaignId: string | null, messageId: string) {
  if (leadId && campaignId) {
    await sb.from("reply_events").insert({
      thread_id: threadId,
      lead_id: leadId,
      campaign_id: campaignId,
      message_id: messageId,
      kind: "bounce",
    });

    await sb
      .from("campaign_leads")
      .update({ status: "bounced" })
      .eq("lead_id", leadId)
      .eq("campaign_id", campaignId);
  }
}

Deno.serve(async (req) => {
  try {
    const payload = (await req.json()) as Payload;
    const messageId = payload?.message_id;

    if (!messageId) {
      return new Response(JSON.stringify({ error: "message_id required" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    const { data: msg, error: msgErr } = await sb
      .from("inbox_messages")
      .select("id, thread_id, subject, body_preview, body_plain, direction")
      .eq("id", messageId)
      .maybeSingle();

    if (msgErr) {
      throw new Error(msgErr.message);
    }

    if (!msg) {
      return new Response(JSON.stringify({ error: "message not found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }

    if (!msg.thread_id) {
      return new Response(JSON.stringify({ error: "message missing thread" }), {
        status: 422,
        headers: { "content-type": "application/json" },
      });
    }

    if (!msg.direction || !["inbound", "in"].includes(msg.direction)) {
      return new Response(JSON.stringify({ ok: true, skipped: "not inbound" }), {
        headers: { "content-type": "application/json" },
      });
    }

    const body = (msg.body_plain || msg.body_preview || "").slice(0, 8000);
    const subject = msg.subject || "";

    const llmLabel = await classify(subject, body);
    const normalized = normalizeLabel(llmLabel);

    await sb
      .from("inbox_messages")
      .update({ ai_label: normalized })
      .eq("id", msg.id);

    const { data: thread, error: threadErr } = await sb
      .from("inbox_threads")
      .select("id, lead_id, campaign_id")
      .eq("id", msg.thread_id)
      .maybeSingle();

    if (threadErr) {
      throw new Error(threadErr.message);
    }

    if (!thread) {
      throw new Error("thread not found");
    }

    const leadId = thread.lead_id ?? null;
    const campaignId = thread.campaign_id ?? null;

    if (normalized === "unsubscribe") {
      await applyUnsubscribe(thread.id, leadId, campaignId, msg.id);
    } else if (normalized === "oOO") {
      await applyOoo(thread.id, leadId, campaignId, msg.id);
    } else if (normalized === "bounce") {
      await applyBounce(thread.id, leadId, campaignId, msg.id);
    }

    if (THREAD_INTEL_URL) {
      await fetch(THREAD_INTEL_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ thread_id: thread.id }),
      }).catch((err) => {
        console.error("ai_label_message::thread_intel failed", err);
      });
    }

    return new Response(JSON.stringify({ ok: true, ai_label: normalized }), {
      headers: { "content-type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
});


