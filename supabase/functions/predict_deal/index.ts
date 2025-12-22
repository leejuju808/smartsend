// Block 26640 — SmartSend Roofing Deal Convert Predictor v1
// Edge Function: Predict deal conversion probability and expected revenue
// Called when job moves stage, lead replies, or AI insights update

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4.58.1";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY")! });

Deno.serve(async (req: Request) => {
  try {
    const { job_id } = await req.json();

    if (!job_id) {
      return new Response(
        JSON.stringify({ error: "job_id is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // 1. Pull job, lead, and context
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select("id, homeowner_name, current_stage, projected_job_value, lead_id, workspace_id")
      .eq("id", job_id)
      .single();

    if (jobError || !job) {
      return new Response(
        JSON.stringify({ error: "Job not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!job.lead_id) {
      return new Response(
        JSON.stringify({ error: "Job has no associated lead" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // 2. Get lead score and heat
    const { data: leadScore } = await supabase
      .from("roofing_lead_scores")
      .select("*")
      .eq("lead_id", job.lead_id)
      .single();

    // 3. Get AI insights
    const { data: insights } = await supabase
      .from("roofing_lead_ai_insights")
      .select("*")
      .eq("lead_id", job.lead_id)
      .single();

    // 4. Get conversation history (try transcript_messages first, then unified_messages)
    const { data: messages } = await supabase
      .from("transcript_messages")
      .select("message_text, sender_type, sender_name, created_at")
      .eq("lead_id", job.lead_id)
      .order("created_at", { ascending: true });

    let convo = "";
    if (messages && messages.length > 0) {
      convo = messages
        .map((m: any) => {
          const sender = m.sender_name || m.sender_type || "Unknown";
          const timestamp = new Date(m.created_at).toLocaleString();
          return `${timestamp} [${sender}]: ${m.message_text}`;
        })
        .join("\n\n");
    } else {
      // Fallback to unified_messages
      const { data: fallbackMessages } = await supabase
        .from("unified_messages")
        .select("body_text, direction, created_at")
        .eq("lead_id", job.lead_id)
        .order("created_at", { ascending: true });

      if (fallbackMessages && fallbackMessages.length > 0) {
        convo = fallbackMessages
          .map((m: any) => `${m.created_at}: ${m.body_text || ""}`)
          .join("\n\n");
      }
    }

    // 5. Get job profit data if available
    const { data: jobProfit } = await supabase
      .from("roofing_job_profit")
      .select("estimated_revenue, margin")
      .eq("job_id", job_id)
      .single();

    // 6. Calculate days since last contact
    const lastMessage = messages && messages.length > 0 
      ? messages[messages.length - 1] 
      : null;
    const daysSinceLastContact = lastMessage
      ? Math.floor((Date.now() - new Date(lastMessage.created_at).getTime()) / (1000 * 60 * 60 * 24))
      : null;

    // 7. Build AI prompt
    const estimatedValue = jobProfit?.estimated_revenue || job.projected_job_value || 0;
    const margin = jobProfit?.margin || 35; // Default 35% margin

    const prompt = `You are a deal prediction AI for a roofing company.

Given:
- Job status: ${job.current_stage}
- Estimated value: $${Number(estimatedValue).toFixed(0)}
- Lead heat score: ${leadScore?.total_score || 0}
- Lead heat level: ${leadScore?.heat_level || "unknown"}
- AI summary: ${insights?.summary || "N/A"}
- Buying intent: ${insights?.buying_intent || "N/A"}
- Intent score: ${insights?.intent_score || "N/A"}
- Objections: ${insights?.objections || "N/A"}
- Days since last contact: ${daysSinceLastContact !== null ? daysSinceLastContact : "N/A"}

Conversation:
${convo || "No conversation history available."}

Estimate:
1. Win probability (0–100) - The likelihood this deal will close based on all signals
2. Confidence level (low/medium/high) - How confident you are in this prediction
3. Follow-up priority (low/medium/high) - How urgently the roofer should follow up
4. One sentence reason summary - Why this probability/priority

Respond in JSON format only:
{
  "win_probability": 0,
  "confidence_level": "medium",
  "follow_up_priority": "high",
  "reason_summary": "..."
}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      response_format: { type: "json_object" },
    });

    const content = completion.choices[0].message.content;
    if (!content) {
      throw new Error("No response from OpenAI");
    }

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      // Try to extract JSON if wrapped in markdown
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("Failed to parse AI response");
      }
    }

    // Validate and normalize
    const winProbability = Math.min(100, Math.max(0, Number(parsed.win_probability) || 0));
    const confidence = parsed.confidence_level || "medium";
    const followPriority = parsed.follow_up_priority || "medium";

    // Calculate expected revenue and profit
    const expectedRevenue = (winProbability / 100) * Number(estimatedValue);
    const expectedProfit = expectedRevenue * (margin / 100);

    // 8. Upsert prediction
    const { error: upsertError } = await supabase
      .from("roofing_deal_predictions")
      .upsert(
        {
          job_id,
          workspace_id: job.workspace_id,
          win_probability: winProbability,
          expected_revenue: expectedRevenue,
          expected_profit: expectedProfit,
          confidence_level: confidence,
          follow_up_priority: followPriority,
          reason_summary: parsed.reason_summary || "No summary available.",
        },
        {
          onConflict: "job_id",
        }
      );

    if (upsertError) {
      console.error("Error upserting prediction:", upsertError);
      return new Response(
        JSON.stringify({ error: "Failed to save prediction", details: upsertError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        job_id,
        win_probability: winProbability,
        expected_revenue: expectedRevenue,
        expected_profit: expectedProfit,
        confidence_level: confidence,
        follow_up_priority: followPriority,
        reason_summary: parsed.reason_summary || "No summary available.",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in predict_deal:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});



































