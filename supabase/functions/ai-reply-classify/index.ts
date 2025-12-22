// supabase/functions/ai-reply-classify/index.ts
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

if (!OPENAI_API_KEY) {
  console.warn(
    "[ai-reply-classify] OPENAI_API_KEY is not set. This function will error until configured."
  );
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type ClassificationResult = {
  label:
    | "positive"
    | "negative"
    | "neutral"
    | "out_of_office"
    | "bounce"
    | "unsubscribe"
    | "other";
  meeting_intent: "none" | "meeting_requested" | "meeting_confirmed" | "followup_needed";
  summary: string;
  confidence: number; // 0–1
};

type RequestPayload = {
  reply_id: string;
  workspace_id?: string;
};

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  if (!OPENAI_API_KEY) {
    return new Response("OPENAI_API_KEY not configured", { status: 500 });
  }

  try {
    const { reply_id, workspace_id }: RequestPayload = await req.json();

    if (!reply_id) {
      return new Response(
        JSON.stringify({ error: "missing_reply_id" }),
        { status: 400 }
      );
    }

    // 1) Load reply row
    const { data: reply, error: replyErr } = await supabase
      .from("reply_logs")
      .select(
        "id, workspace_id, lead_id, campaign_id, subject, body_plain, body_html, received_at, ai_label, ai_classified_at"
      )
      .eq("id", reply_id)
      .maybeSingle();

    if (replyErr) {
      console.error("[ai-reply-classify] reply query error", replyErr);
      return new Response(
        JSON.stringify({ error: "reply_query_failed" }),
        { status: 500 }
      );
    }

    if (!reply) {
      return new Response(
        JSON.stringify({ error: "reply_not_found" }),
        { status: 404 }
      );
    }

    if (workspace_id && reply.workspace_id !== workspace_id) {
      return new Response(
        JSON.stringify({ error: "workspace_mismatch" }),
        { status: 403 }
      );
    }

    // Optional: if already classified, you could early exit
    // if (reply.ai_label && reply.ai_classified_at) {
    //   return new Response(
    //     JSON.stringify({ status: "already_classified" }),
    //     { status: 200 }
    //   );
    // }

    const subject: string = reply.subject ?? "";
    const bodyPlain: string = reply.body_plain ?? "";
    const bodyHtml: string = reply.body_html ?? "";

    const textSource =
      bodyPlain && bodyPlain.trim().length > 0
        ? bodyPlain
        : bodyHtml && bodyHtml.trim().length > 0
        ? bodyHtml
        : subject;

    if (!textSource || textSource.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "empty_body" }),
        { status: 400 }
      );
    }

    // 2) Call OpenAI
    const classification = await classifyReplyWithOpenAI(
      subject,
      textSource
    );

    // 3) Persist back to reply_logs
    const nowIso = new Date().toISOString();

    const { error: updateErr } = await supabase
      .from("reply_logs")
      .update({
        ai_label: classification.label,
        ai_intent_summary: classification.summary,
        ai_meeting_intent: classification.meeting_intent,
        ai_confidence: classification.confidence,
        ai_raw: classification, // we can store the parsed JSON result
        ai_classified_at: nowIso,
      })
      .eq("id", reply_id);

    if (updateErr) {
      console.error("[ai-reply-classify] update error", updateErr);
      return new Response(
        JSON.stringify({ error: "update_failed" }),
        { status: 500 }
      );
    }

    // 🔥 sync down to lead & campaign enrollment
    try {
      await syncReplyToLeadAndCampaign(reply, classification);
    } catch (syncErr) {
      console.error(
        "[ai-reply-classify] syncReplyToLeadAndCampaign error",
        syncErr
      );
    }

    return new Response(
      JSON.stringify({
        status: "ok",
        reply_id,
        classification,
      }),
      { status: 200 }
    );
  } catch (err) {
    console.error("[ai-reply-classify] error", err);
    return new Response(
      JSON.stringify({ error: "server_error" }),
      { status: 500 }
    );
  }
});

async function classifyReplyWithOpenAI(
  subject: string,
  body: string
): Promise<ClassificationResult> {
  const prompt = buildPrompt(subject, body);

  const payload = {
    model: "gpt-4o-mini", // or your preferred model
    response_format: { type: "json_schema", json_schema: {
      name: "reply_classification",
      schema: {
        type: "object",
        properties: {
          label: {
            type: "string",
            enum: [
              "positive",
              "negative",
              "neutral",
              "out_of_office",
              "bounce",
              "unsubscribe",
              "other"
            ]
          },
          meeting_intent: {
            type: "string",
            enum: [
              "none",
              "meeting_requested",
              "meeting_confirmed",
              "followup_needed"
            ]
          },
          summary: {
            type: "string",
            description: "Short 1-2 sentence summary of what the lead is saying."
          },
          confidence: {
            type: "number",
            minimum: 0,
            maximum: 1
          }
        },
        required: ["label", "meeting_intent", "summary", "confidence"],
        additionalProperties: false
      }
    }},
    messages: [
      {
        role: "system",
        content:
          "You are an assistant that classifies cold email replies for a sales outreach tool. Always respond with strict JSON only, no additional text.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
  };

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("[ai-reply-classify] OpenAI error", res.status, text);
    throw new Error("openai_error");
  }

  const json = await res.json();

  const content = json.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("no_content_from_openai");
  }

  let parsed: any;
  try {
    parsed = typeof content === "string" ? JSON.parse(content) : content;
  } catch (e) {
    console.error("[ai-reply-classify] parsing error", e, content);
    throw new Error("parse_error");
  }

  const label = parsed.label as ClassificationResult["label"];
  const meeting_intent =
    parsed.meeting_intent as ClassificationResult["meeting_intent"];
  const summary = String(parsed.summary ?? "").slice(0, 500);
  const confidenceNum = Number(parsed.confidence ?? 0.8);
  const confidence =
    confidenceNum < 0 ? 0 : confidenceNum > 1 ? 1 : confidenceNum;

  return {
    label:
      label ??
      "other",
    meeting_intent: meeting_intent ?? "none",
    summary,
    confidence,
  };
}

function buildPrompt(subject: string, body: string): string {
  return `
You are classifying a reply to a cold outreach email.

You MUST decide:

1. Overall sentiment / type of reply:

   - "positive": Interested, open to talk, generally positive.

   - "negative": Not interested, stop emailing, upset.

   - "neutral": Polite but non-committal, vague, neither clearly positive nor negative.

   - "out_of_office": Auto-responder, vacation, back on X date.

   - "bounce": Delivery failure, mailbox full, user unknown, etc.

   - "unsubscribe": Explicitly asking to be removed / unsubscribed.

   - "other": Anything that does not fit above.

2. Meeting intent:

   - "none": No clear meeting requested or confirmed.

   - "meeting_requested": The lead suggests or asks for a call/meeting but not fully confirmed.

   - "meeting_confirmed": The lead clearly confirms a meeting time or accepts a calendar invite.

   - "followup_needed": They ask for more info, different timing, or a later check-in.

3. A short summary:

   - 1–2 sentences describing what the lead wants or is saying.

Return JSON ONLY with:

{
  "label": "...",
  "meeting_intent": "...",
  "summary": "...",
  "confidence": 0.0-1.0
}

Email subject:
${subject || "(no subject)"}

Email body:
${body.slice(0, 4000)}
`;
}

async function syncReplyToLeadAndCampaign(
  reply: any,
  classification: ClassificationResult
) {
  const leadId: string | null = reply.lead_id ?? null;
  const campaignId: string | null = reply.campaign_id ?? null;
  const receivedAt: string | null = reply.received_at ?? null;

  const when = receivedAt || new Date().toISOString();

  const label = classification.label;
  const summary = classification.summary;

  // a) Update LEAD if present
  if (leadId) {
    // Flags
    const isBounce = label === "bounce";
    const isUnsub = label === "unsubscribe";
    const isRealReply =
      label === "positive" ||
      label === "negative" ||
      label === "neutral" ||
      label === "out_of_office" ||
      label === "unsubscribe" ||
      label === "other";

    const leadPatch: any = {
      last_reply_at: when,
      last_reply_label: label,
      last_reply_summary: summary,
    };

    if (isRealReply) {
      leadPatch.has_replied = true;
    }
    if (isUnsub) {
      leadPatch.unsubscribed = true;
    }
    if (isBounce) {
      leadPatch.bounced = true;
    }

    const { error: leadErr } = await supabase
      .from("leads")
      .update(leadPatch)
      .eq("id", leadId);

    if (leadErr) {
      console.error("[ai-reply-classify] lead update error", leadErr);
    }
  }

  // b) Update CAMPAIGN_LEADS (enrollment) if we have campaign + lead
  if (leadId && campaignId) {
    const isBounce = label === "bounce";
    const isUnsub = label === "unsubscribe";
    const isRealReply =
      label === "positive" ||
      label === "negative" ||
      label === "neutral" ||
      label === "out_of_office" ||
      label === "unsubscribe" ||
      label === "other";

    // 🔥 Fetch campaign SmartStop config
    let autoStopOnAnyReply = true;
    const { data: campaign, error: campaignErr } = await supabase
      .from("campaigns")
      .select("auto_stop_on_any_reply")
      .eq("id", campaignId)
      .maybeSingle();

    if (campaignErr) {
      console.error(
        "[ai-reply-classify] campaign query error",
        campaignErr
      );
    } else if (campaign) {
      autoStopOnAnyReply =
        (campaign as any).auto_stop_on_any_reply ?? true;
    }

    // Decide new status:
    let newStatus: string | null = null;

    if (isBounce) {
      newStatus = "bounced";
    } else if (isUnsub) {
      newStatus = "unsubscribed";
    } else if (isRealReply && autoStopOnAnyReply) {
      // Only stop for "normal" replies if SmartStop is ON
      newStatus = "replied";
    }

    const enrollmentPatch: any = {
      last_reply_at: when,
      last_reply_label: label,
      last_reply_summary: summary,
    };

    if (newStatus) {
      enrollmentPatch.status = newStatus;
      enrollmentPatch.status_reason =
        newStatus === "replied"
          ? "Lead replied to this campaign."
          : newStatus === "unsubscribed"
          ? "Lead asked to be unsubscribed."
          : newStatus === "bounced"
          ? "Email bounced."
          : summary;
    }

    const { error: enrErr } = await supabase
      .from("campaign_leads")
      .update(enrollmentPatch)
      .eq("campaign_id", campaignId)
      .eq("lead_id", leadId);

    if (enrErr) {
      console.error(
        "[ai-reply-classify] campaign_leads update error",
        enrErr
      );
    }
  }
}

