// Block 22179 — SmartSend Roofing "Hot Lead Detector v1"
// Edge Function: Real-time AI detection of homeowners ready to buy NOW
//
// This engine monitors:
// - initial inquiry messages
// - inbound SMS
// - inbound emails
// - contact form submissions
// - conversation transcript
// - tone + intent signals
// - keywords and urgency cues
// - insurance urgency
// - storm urgency
// - stage behavior
// - fast replies by homeowner
//
// When a HOT LEAD is detected:
// - job is instantly flagged
// - estimator receives notification
// - Action Queue creates a "CALL NOW" task
// - Pipeline card glows orange/red
// - AI next-action engine prioritizes immediate contact
// - Timeline logs "Hot Lead Detected"
// - Probability jumps accordingly

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://deno.land/x/openai@v4.20.1/mod.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const openaiApiKey = Deno.env.get("OPENAI_API_KEY")!;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
});

const openai = new OpenAI({
  apiKey: openaiApiKey,
});

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const { lead_id, homeowner_message, transcript_snapshot } = await req.json();

    if (!lead_id) {
      return new Response(
        JSON.stringify({ error: "Missing lead_id" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get lead info
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("id, workspace_id, email, name, source, created_at, pipeline_stage")
      .eq("id", lead_id)
      .single();

    if (leadError || !lead) {
      return new Response(
        JSON.stringify({ error: "Lead not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get transcript snapshot if not provided
    let transcript = transcript_snapshot;
    if (!transcript) {
      const { data: transcriptData, error: transcriptError } = await supabase
        .rpc("get_lead_transcript_snapshot", { p_lead_id: lead_id, p_limit: 20 });

      if (!transcriptError && transcriptData) {
        transcript = transcriptData;
      }
    }

    // Build AI prompt for hot lead detection
    const prompt = `You are SmartSend AI, a roofing company intelligence system. Determine if this homeowner is a HOT LEAD.

Use these 11 categories of signals to detect high buying intent:

1. INTENT KEYWORDS:
   - "ready to move forward"
   - "want roof replaced"
   - "need quote asap"
   - "insurance claim"
   - "roof leaking"
   - "how soon can you start"
   - "what's the next step"
   - "when can someone come out"
   - "urgent repair"

2. URGENCY BEHAVIOR:
   - Homeowner replies within minutes
   - Sends photos fast
   - Requests inspection time
   - Asks about install schedule

3. POSITIVE TONE:
   - Excited, cooperative, relieved, grateful, confident

4. BUYING QUESTIONS:
   - Warranty details, financing, materials, shingle type, timeline, next steps

5. INSURANCE SIGNALS:
   - "adjuster coming"
   - "claim number ready"
   - "need contractor ASAP"
   - "restoration deadline"

6. STORM / DAMAGE KEYWORDS:
   - Hail, wind damage, tree fall, active leak, tarping

7. HIGH VALUE ESTIMATE BEHAVIOR:
   - Big home, requesting full replacement, asking about upgrades

8. LEAD SOURCE WEIGHT:
   - Referrals, Google intent leads, LSA have naturally higher hot lead probability

9. TRANSCRIPT PATTERN RECOGNITION:
   - Decisive decision maker, no hesitations, action language

10. STAGE ACCELERATION:
    - If a lead jumps stages faster than typical patterns → hot

11. ESTIMATOR RESPONSE INFLUENCE:
    - If homeowner responds positively after estimator message, momentum spike → hot

Current Message:
"${homeowner_message || "No message provided"}"

Transcript (recent messages):
${JSON.stringify(transcript || [], null, 2)}

Lead Info:
- Source: ${lead.source || "unknown"}
- Created: ${lead.created_at}
- Stage: ${lead.pipeline_stage || "new"}

Respond with JSON:
{
  "is_hot": true | false,
  "hot_score": 0-100,
  "reason": "Brief explanation of why this lead is hot (e.g., 'Homeowner requested timeline + insurance details within 3 minutes.')"
}

Be strict: Only mark as hot (is_hot: true) if hot_score >= 70.`;

    // Call OpenAI
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "You are a roofing industry AI that detects high-intent homeowners. Respond only with valid JSON.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.3,
    });

    const resultText = completion.choices[0]?.message?.content || "{}";
    let result: { is_hot: boolean; hot_score: number; reason: string };

    try {
      result = JSON.parse(resultText);
    } catch (e) {
      console.error("Failed to parse OpenAI response:", resultText);
      return new Response(
        JSON.stringify({ error: "Failed to parse AI response", raw: resultText }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Ensure is_hot is only true if hot_score >= 70
    if (result.hot_score < 70) {
      result.is_hot = false;
    }

    // Update lead if hot
    if (result.is_hot) {
      const { error: updateError } = await supabase
        .from("leads")
        .update({
          is_hot: true,
          hot_reason: result.reason,
          hot_score: result.hot_score,
        })
        .eq("id", lead_id);

      if (updateError) {
        console.error("Error updating lead:", updateError);
        return new Response(
          JSON.stringify({ error: "Failed to update lead", details: updateError.message }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }

      // Add timeline event
      const { error: timelineError } = await supabase
        .from("job_timelines")
        .insert({
          lead_id: lead_id,
          event_type: "hot_lead_detected",
          event_category: "ai_intelligence",
          event_summary: "🔥 Hot Lead Detected",
          event_data: {
            hot_score: result.hot_score,
            reason: result.reason,
            detected_at: new Date().toISOString(),
          },
        });

      if (timelineError) {
        console.error("Error creating timeline event:", timelineError);
        // Don't fail the request, just log
      }

      // Create action queue task: CALL NOW
      const { error: actionError } = await supabase
        .from("action_queue_tasks")
        .insert({
          lead_id: lead_id,
          workspace_id: lead.workspace_id,
          task_type: "call_now",
          action_priority: 1, // Highest priority
          action_category: "communication",
          next_action: "call_now",
          next_action_reason: `🔥 Hot Lead: ${result.reason}`,
          due_at: new Date().toISOString(), // Due immediately
          auto_generated: true,
          priority: 1,
          source: "hot_lead_detector",
          metadata: {
            hot_score: result.hot_score,
            reason: result.reason,
            detected_at: new Date().toISOString(),
          },
        });

      if (actionError) {
        console.error("Error creating action queue task:", actionError);
        // Don't fail the request, just log
      }
    } else {
      // If not hot, ensure is_hot is false (in case it was previously hot)
      const { error: updateError } = await supabase
        .from("leads")
        .update({
          is_hot: false,
          hot_score: result.hot_score,
        })
        .eq("id", lead_id);

      if (updateError) {
        console.error("Error updating lead (not hot):", updateError);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        is_hot: result.is_hot,
        hot_score: result.hot_score,
        reason: result.reason,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (error) {
    console.error("Error in detect-hot-lead:", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        details: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
});









































