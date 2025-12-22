import { serve } from "https://deno.land/std/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type IntentLabel =
  | "not_interested"
  | "unsubscribe"
  | "needs_info"
  | "follow_up_later"
  | "open_to_chat"
  | "ready_to_meet"
  | "referral"
  | "out_of_office"
  | "unclear";

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiKey = Deno.env.get("OPENAI_API_KEY");

    if (!openaiKey) {
      return new Response(
        JSON.stringify({ error: "OPENAI_API_KEY not configured" }),
        { status: 500 },
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { reply_id } = await req.json();

    if (!reply_id) {
      return new Response(
        JSON.stringify({ error: "reply_id is required" }),
        { status: 400 },
      );
    }

    // 1) Pull reply + lead context
    const { data: reply, error: replyError } = await supabase
      .from("lead_replies")
      .select("id, body_text, subject, lead_id")
      .eq("id", reply_id)
      .single();

    if (replyError || !reply) {
      return new Response(
        JSON.stringify({ error: "Reply not found", details: replyError }),
        { status: 404 },
      );
    }

    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("id, email, first_name, last_name")
      .eq("id", reply.lead_id)
      .single();

    if (leadError) {
      // Not fatal; we can still classify using only reply text
      console.warn("Meeting intent extractor: lead lookup failed", leadError);
    }

    const timezone = Deno.env.get("DEFAULT_MEETING_TIMEZONE") || "America/Los_Angeles";
    const workStartHour = Number(Deno.env.get("DEFAULT_MEETING_START_HOUR") || "9");
    const workEndHour = Number(Deno.env.get("DEFAULT_MEETING_END_HOUR") || "16");

    // 2) Build prompt for OpenAI
    const bodyText: string = reply.body_text || "";

    const systemPrompt = `
You are an AI SDR assistant. Your job:

1) Classify the sales intent of this email reply to a cold outbound sequence.

2) Estimate how ready this person is to take a meeting.

3) Suggest 2–3 concrete meeting time windows in the sender's timezone, on weekdays only, within the next 7 business days, IF they show interest.

4) Respond ONLY as strict JSON, no extra text.

Use these labels for "intent_label":

- "not_interested"      = clearly rejecting, shutting down.

- "unsubscribe"         = asks to be removed, never contact again.

- "needs_info"          = asks questions, wants details before deciding.

- "follow_up_later"     = interested but timing is bad, asks to check back.

- "open_to_chat"        = vague positive, not explicitly booking.

- "ready_to_meet"       = clearly asking to schedule or pick a time.

- "referral"            = refers you to someone else.

- "out_of_office"       = auto-reply OOO style.

- "unclear"             = you can't confidently tell.

"meeting_readiness" values:

- "none"   = not a lead / unsubscribe / OOO / not_interested.

- "low"    = needs_info, unclear.

- "medium" = follow_up_later, open_to_chat.

- "high"   = ready_to_meet or very strong interest.

If they are not interested, unsubscribing, OOO, or unclear, return an EMPTY array for "suggested_meeting_times".

If they are interested or ready_to_meet, return 2–3 suggested times.

"suggested_meeting_times" should be an array of objects with:

- "start": ISO 8601 datetime string

- "end": ISO 8601 datetime string

- "timezone": string (like "America/Los_Angeles")

- "note": short human-readable label such as "Tomorrow, 10:00–10:30".

Meeting duration: 30 minutes.

Use only weekdays (Mon–Fri) within the next 7 business days from NOW in the given timezone.

Try to place times between ${workStartHour}:00 and ${workEndHour}:00 local time.

    `.trim();

    const userPrompt = `
Cold email reply:

Subject: ${reply.subject || "(no subject)"}

Body:

${bodyText}

Lead context (may be partial):

Name: ${lead ? `${lead.first_name || ""} ${lead.last_name || ""}`.trim() : "Unknown"}

Email: ${lead?.email || "Unknown"}

Timezone to use for suggestions: ${timezone}

Return JSON with shape:

{
  "intent_label": "not_interested" | "unsubscribe" | "needs_info" | "follow_up_later" | "open_to_chat" | "ready_to_meet" | "referral" | "out_of_office" | "unclear",
  "intent_confidence": number,        // between 0 and 1
  "meeting_readiness": "none" | "low" | "medium" | "high",
  "suggested_meeting_times": [
    {
      "start": "ISO_DATETIME",
      "end": "ISO_DATETIME",
      "timezone": "string",
      "note": "string"
    }
  ]
}

`.trim();

    // 3) Call OpenAI
    const completionRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.1,
      }),
    });

    if (!completionRes.ok) {
      const errText = await completionRes.text();
      console.error("OpenAI error:", errText);
      return new Response(
        JSON.stringify({ error: "OpenAI API error", details: errText }),
        { status: 500 },
      );
    }

    const completionJson = await completionRes.json();
    const content = completionJson.choices?.[0]?.message?.content;

    if (!content) {
      return new Response(
        JSON.stringify({ error: "No content from OpenAI" }),
        { status: 500 },
      );
    }

    let parsed: {
      intent_label: IntentLabel;
      intent_confidence: number;
      meeting_readiness: "none" | "low" | "medium" | "high";
      suggested_meeting_times: Array<{
        start: string;
        end: string;
        timezone: string;
        note: string;
      }>;

    };

    try {
      // Try to extract JSON if wrapped in markdown code blocks
      const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/) || [null, content];
      parsed = JSON.parse(jsonMatch[1] || content);
    } catch (e) {
      console.error("JSON parse error on OpenAI content:", content);
      return new Response(
        JSON.stringify({ error: "Failed to parse JSON from OpenAI", raw: content }),
        { status: 500 },
      );
    }

    // 4) Persist to DB
    const { error: updateError } = await supabase
      .from("lead_replies")
      .update({
        intent_label: parsed.intent_label,
        intent_confidence: parsed.intent_confidence,
        meeting_readiness: parsed.meeting_readiness,
        suggested_meeting_times: parsed.suggested_meeting_times ?? [],
      })
      .eq("id", reply_id);

    if (updateError) {
      return new Response(
        JSON.stringify({ error: "Failed to update lead_replies", details: updateError }),
        { status: 500 },
      );
    }

    // 5) (Optional) You can hook into intent-score-update here later if you want:
    // if (parsed.meeting_readiness === "high") call intent-score-update with "reply_interest"

    return new Response(JSON.stringify(parsed), { status: 200 });
  } catch (err) {
    console.error("meeting-intent-extractor error:", err);
    return new Response(
      JSON.stringify({ error: "Unexpected error", details: String(err) }),
      { status: 500 },
    );
  }
});

