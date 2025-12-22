import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import OpenAI from "openai";
import { createClient } from "jsr:@supabase/supabase-js@2";

const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY")! });

Deno.serve(async (req) => {
  try {
    const { reply_id } = await req.json();

    if (!reply_id) {
      return new Response(
        JSON.stringify({ error: "reply_id is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1) Load reply + intent + lead context
    const { data: reply, error: replyError } = await supabase
      .from("email_replies")
      .select("*")
      .eq("id", reply_id)
      .single();

    if (replyError || !reply) {
      return new Response(
        JSON.stringify({ error: "Reply not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    const { data: intent } = await supabase
      .from("reply_intent")
      .select("*")
      .eq("reply_id", reply_id)
      .single();

    // Get lead info from email_logs -> leads
    let lead: any = null;
    if (reply.email_log_id) {
      const { data: emailLog } = await supabase
        .from("email_logs")
        .select("lead_id")
        .eq("id", reply.email_log_id)
        .single();

      if (emailLog?.lead_id) {
        const { data: leadData } = await supabase
          .from("leads")
          .select("first_name, last_name, email, company")
          .eq("id", emailLog.lead_id)
          .single();
        lead = leadData;
      }
    }

    // Fallback: try to get lead from reply if it has lead_id directly
    if (!lead && (reply as any).lead_id) {
      const { data: leadData } = await supabase
        .from("leads")
        .select("first_name, last_name, email, company")
        .eq("id", (reply as any).lead_id)
        .single();
      lead = leadData;
    }

    const category = intent?.category || "neutral";
    const sentiment = intent?.sentiment || "neutral";
    const objection = intent?.objection_type || null;

    const replyBody = reply.body_text || reply.body_html || reply.raw_text || "";

    // 2) Build prompt
    const prompt = `
You are SmartSend's AI Reply Assistant.

Your job: Generate 3 short, professional email reply drafts that the user can send back.

Context:
- Lead name: ${lead?.first_name || ""} ${lead?.last_name || ""}
- Company: ${lead?.company || ""}
- Reply category: ${category}
- Sentiment: ${sentiment}
- Objection type (if any): ${objection || "none"}
- Original reply:

"""
${replyBody.slice(0, 2000)}
"""

Rules:
- Write from the perspective of the salesperson who sent the original cold email.
- Keep it short, clear, and respectful.
- Do NOT make big promises or guarantees.
- If category = "meeting", lean into confirming time/details.
- If category = "unsubscribe", write a simple confirmation and no further pitch.
- If category = "objection", address it briefly then either ask a clarifying question or gracefully close.
- Use the lead's first name in greeting if available.
- Do NOT include any subject line, only body text.
- Return STRICT JSON:

{
  "suggestions": [
    {
      "label": "Short follow-up",
      "body": "..."
    },
    {
      "label": "Clarify offer",
      "body": "..."
    },
    {
      "label": "Book meeting",
      "body": "..."
    }
  ]
}
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.7,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "You are SmartSend's AI Reply Assistant. Always return valid JSON." },
        { role: "user", content: prompt },
      ],
    });

    const raw = completion.choices[0]?.message?.content || "{}";
    let parsed;
    try {
      parsed = JSON.parse(raw);
      // Ensure suggestions array exists
      if (!parsed.suggestions || !Array.isArray(parsed.suggestions)) {
        throw new Error("Invalid response format");
      }
    } catch (_e) {
      // Fallback: create a single suggestion from raw text
      parsed = {
        suggestions: [
          {
            label: "Reply",
            body: raw.replace(/```json\n?|\n?```/g, "").trim(),
          },
        ],
      };
    }

    return new Response(JSON.stringify(parsed), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});







