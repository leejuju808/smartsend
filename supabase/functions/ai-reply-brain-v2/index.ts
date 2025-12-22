// Block 300 — Adaptive Reply Brain v2
// AI-powered reply classification with intent scoring, sentiment, meeting extraction, and more

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://deno.land/x/openai@v4.21.0/mod.ts";

const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY")! });
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

serve(async (req) => {
  try {
    const { text, reply_id, workspace_id } = await req.json();

    if (!text || !reply_id) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: text, reply_id" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const prompt = `You are SmartSend's Adaptive Reply Brain v2.

Classify this email reply with:
- category (one of: meeting, positive, negative, neutral, referral, out_of_office, unsubscribe, objection, wrong_person, bounce, spam, ambiguous)
- sentiment (positive | neutral | negative)
- intent_score (0–100, where 100 is highly engaged/positive, 0 is negative/unsubscribe)
- meeting info (time, date, timezone, link, location if present)
- objection_type (price, timing, not_interested, competitor, follow_up_later, or null if not an objection)
- confidence score 0–100

Return STRICT JSON only, no markdown, no explanation:

{
  "category": "",
  "sentiment": "",
  "intent_score": 0,
  "meeting": {
    "time": "",
    "timezone": "",
    "location": "",
    "link": ""
  },
  "objection_type": null,
  "confidence": 0
}

Reply to classify:

"${text}"`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0].message.content || "{}";
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      console.error("Failed to parse LLM response:", raw, e);
      return new Response(
        JSON.stringify({ error: "Failed to parse LLM response", raw }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Extract meeting time if provided (parse ISO string)
    let meetingTime: string | null = null;
    if (parsed.meeting?.time) {
      try {
        // Try to parse the time string
        const timeStr = parsed.meeting.time;
        if (timeStr && timeStr.length > 0) {
          // If it's already ISO format, use it; otherwise try to parse
          const parsedDate = new Date(timeStr);
          if (!isNaN(parsedDate.getTime())) {
            meetingTime = parsedDate.toISOString();
          }
        }
      } catch (e) {
        console.error("Failed to parse meeting time:", parsed.meeting.time, e);
      }
    }

    // Insert into reply_intent table
    const { data: intent, error: insertError } = await supabase
      .from("reply_intent")
      .insert({
        reply_id,
        workspace_id: workspace_id || null,
        category: parsed.category || null,
        sentiment: parsed.sentiment || null,
        intent_score: parsed.intent_score || null,
        meeting_time: meetingTime,
        meeting_timezone: parsed.meeting?.timezone || null,
        meeting_location: parsed.meeting?.location || null,
        meeting_link: parsed.meeting?.link || null,
        objection_type: parsed.objection_type || null,
        extracted: parsed,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Failed to insert reply_intent:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to insert intent", details: insertError }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Trigger auto-actions asynchronously (don't wait)
    if (intent) {
      // Get reply details for auto-actions
      const { data: reply } = await supabase
        .from("email_replies")
        .select("id, email_log_id")
        .eq("id", reply_id)
        .maybeSingle();

      if (reply?.email_log_id) {
        const { data: emailLog } = await supabase
          .from("email_logs")
          .select("lead_id, user_id")
          .eq("id", reply.email_log_id)
          .maybeSingle();

        // Get workspace_id if not provided
        let finalWorkspaceId = workspace_id;
        if (!finalWorkspaceId && emailLog?.user_id) {
          const { data: member } = await supabase
            .from("workspace_members")
            .select("workspace_id")
            .eq("user_id", emailLog.user_id)
            .limit(1)
            .maybeSingle();
          finalWorkspaceId = member?.workspace_id || null;
        }

        // Trigger auto-actions via API route
        // This is async - don't wait for it
        const baseUrl = Deno.env.get("NEXT_PUBLIC_BASE_URL") || 
                       Deno.env.get("NEXT_PUBLIC_VERCEL_URL") || 
                       "http://localhost:3000";
        
        fetch(`${baseUrl}/api/replies/auto-actions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            intent_id: intent.id,
          }),
        }).catch((e) => {
          console.error("Failed to trigger auto-actions:", e);
        });
      }
    }

    return new Response(
      JSON.stringify({ ok: true, parsed, intent }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    console.error("Error in ai-reply-brain-v2:", e);
    return new Response(
      JSON.stringify({ error: e?.message || String(e) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

