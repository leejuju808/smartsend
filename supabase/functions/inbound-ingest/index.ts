// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL =
  Deno.env.get("SUPABASE_URL") ??
  Deno.env.get("NEXT_PUBLIC_SUPABASE_URL");
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY");
const WEBHOOK_SECRET = Deno.env.get("INBOUND_WEBHOOK_SECRET") ?? undefined;

if (!SUPABASE_URL) {
  throw new Error("SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) is not configured");
}

if (!SERVICE_KEY) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY is required");
}

type InboundPayload = {
  provider: "gmail" | "outlook";
  provider_message_id: string;
  campaign_id: string;
  thread_id: string;
  lead_id: string;
  subject?: string;
  body_html?: string;
  body_plain?: string;
  from_email?: string;
  to_email?: string;
  received_at?: string;
};

async function classifyMessage(text: string): Promise<string> {
  if (!OPENAI_KEY) return "neutral";

  const trimmed = text.trim();
  if (!trimmed) return "neutral";

  const prompt = `Classify this inbound email into one of: positive, negative, question, neutral, oos (out-of-scope), bounce.
Return only the label.
Email:
${trimmed.slice(0, 4000)}`;

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${OPENAI_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
    }),
  });

  if (!resp.ok) {
    const detail = await resp.text().catch(() => "unknown error");
    throw new Error(`OpenAI classify error: ${detail}`);
  }

  const json = (await resp.json()) as any;
  const label = json?.choices?.[0]?.message?.content?.trim().toLowerCase();
  return label || "neutral";
}

function needsAutoReplyStop(label: string): boolean {
  return ["positive", "question", "neutral"].includes(label);
}

function isBounce(label: string, subj?: string, body?: string): boolean {
  if (label === "bounce") return true;
  const haystack = `${subj ?? ""} ${body ?? ""}`.toLowerCase();
  return /delivery.*failed|undeliverable|mailbox.*full|550 |5\.1\./.test(haystack);
}

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response("ok", {
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-headers": "content-type, authorization, x-inbound-secret",
        },
      });
    }

    if (req.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    if (WEBHOOK_SECRET) {
      const provided = req.headers.get("x-inbound-secret");
      if (provided !== WEBHOOK_SECRET) {
        return new Response("Unauthorized", { status: 401 });
      }
    }

    const payload = (await req.json()) as InboundPayload;

    if (
      !payload?.provider ||
      !payload.provider_message_id ||
      !payload.thread_id ||
      !payload.lead_id ||
      !payload.campaign_id
    ) {
      return new Response("Bad Request", { status: 400 });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
    });

    const { data: msgId, error: upsertError } = await supabase.rpc("upsert_inbound_message", {
      p_provider: payload.provider,
      p_provider_message_id: payload.provider_message_id,
      p_thread: payload.thread_id,
      p_campaign: payload.campaign_id,
      p_lead: payload.lead_id,
      p_subject: payload.subject ?? null,
      p_body_html: payload.body_html ?? null,
      p_body_plain: payload.body_plain ?? null,
      p_from_email: payload.from_email ?? null,
      p_to_email: payload.to_email ?? null,
      p_received_at: payload.received_at ?? null,
    });

    if (upsertError) {
      throw upsertError;
    }

    const textForAI =
      (payload.body_plain && payload.body_plain.trim().length > 0
        ? payload.body_plain
        : (payload.body_html ?? "").replace(/<[^>]+>/g, " ")) || "";

    let label = "neutral";
    try {
      label = await classifyMessage(textForAI);
    } catch (error) {
      console.error("inbound-ingest classify error", error);
      label = "neutral";
    }

    await supabase
      .from("inbox_messages")
      .update({ ai_label: label })
      .eq("id", msgId as string);

    const doBounce = isBounce(label, payload.subject, `${payload.body_plain ?? ""} ${payload.body_html ?? ""}`);
    const doStop = needsAutoReplyStop(label);

    if (doBounce) {
      await supabase.rpc("fn_mark_thread_replied", { p_thread: payload.thread_id });
      await supabase.rpc("fn_autopause_lead", {
        p_campaign: payload.campaign_id,
        p_lead: payload.lead_id,
      });
    } else if (doStop) {
      await supabase.rpc("fn_mark_thread_replied", { p_thread: payload.thread_id });
      await supabase.rpc("fn_autopause_lead", {
        p_campaign: payload.campaign_id,
        p_lead: payload.lead_id,
      });
    }

    const cronSecret = Deno.env.get("CRON_SECRET") ?? "";
    fetch(`${SUPABASE_URL}/functions/v1/meeting-detect?thread_id=${payload.thread_id}`, {
      method: "POST",
      headers: { "x-cron-secret": cronSecret },
    }).catch((err) => console.error("meeting-detect trigger failed", err));

    // Block 22179 — Hot Lead Detector: Trigger detection for homeowner messages
    if (payload.lead_id && textForAI && textForAI.trim().length > 0) {
      fetch(`${SUPABASE_URL}/functions/v1/detect-hot-lead`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${SERVICE_KEY}`,
        },
        body: JSON.stringify({
          lead_id: payload.lead_id,
          homeowner_message: textForAI,
          transcript_snapshot: null, // Will be fetched by the function
        }),
      }).catch((err) => {
        console.error("Error triggering hot lead detection:", err);
        // Don't fail the request if hot lead detection fails
      });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        message_id: msgId,
        ai_label: label,
        bounce: doBounce,
        stopped: doStop,
      }),
      {
        headers: { "content-type": "application/json" },
      }
    );
  } catch (error: any) {
    const message = String(error?.message ?? error ?? "unknown error");
    console.error("inbound-ingest error", message);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
});


