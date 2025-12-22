// Block 21912 — SmartSend Roofing Job Probability Explainer v1
// 📊 "Why Is This Job at 62%?" — Transparent AI That Roofers Trust
// Edge Function: Generates AI-powered explanations for job probability scores

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

Deno.serve(async (req) => {
  try {
    const { lead_id } = await req.json();

    if (!lead_id) {
      return new Response(
        JSON.stringify({ error: "Missing lead_id" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // ============================================================================
    // 1. FETCH COMPREHENSIVE LEAD DATA
    // ============================================================================

    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("*")
      .eq("id", lead_id)
      .single();

    if (leadError || !lead) {
      return new Response(
        JSON.stringify({ error: "Lead not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Fetch activities for homeowner tone and reply analysis
    const { data: activities } = await supabase
      .from("lead_activities")
      .select("kind, created_at, body, meta, homeowner_tone, homeowner_intent")
      .eq("lead_id", lead_id)
      .order("created_at", { ascending: true });

    const homeownerReplies = activities?.filter(a => a.kind === "message_in") || [];
    const replyCount = homeownerReplies.length;

    // Get latest homeowner tone
    const latestTone = homeownerReplies.length > 0
      ? homeownerReplies[homeownerReplies.length - 1].homeowner_tone
      : null;

    // Calculate reply speed (average response time)
    let avgReplySpeedHours: number | null = null;
    if (homeownerReplies.length > 0) {
      const replySpeeds: number[] = [];
      for (let i = 0; i < homeownerReplies.length; i++) {
        const reply = homeownerReplies[i];
        const responseTimeSeconds = reply.meta?.response_time_seconds;
        if (responseTimeSeconds && responseTimeSeconds > 0) {
          replySpeeds.push(responseTimeSeconds / 3600); // Convert to hours
        }
      }
      if (replySpeeds.length > 0) {
        avgReplySpeedHours = replySpeeds.reduce((a, b) => a + b, 0) / replySpeeds.length;
      }
    }

    // Calculate estimator reply speed
    const estimatorReplies = activities?.filter(a => a.kind === "message_out") || [];
    let avgEstimatorReplySpeedHours: number | null = null;
    if (estimatorReplies.length > 0) {
      const estimatorSpeeds: number[] = [];
      for (let i = 0; i < estimatorReplies.length; i++) {
        const reply = estimatorReplies[i];
        const responseTimeSeconds = reply.meta?.response_time_seconds;
        if (responseTimeSeconds && responseTimeSeconds > 0) {
          estimatorSpeeds.push(responseTimeSeconds / 3600);
        }
      }
      if (estimatorSpeeds.length > 0) {
        avgEstimatorReplySpeedHours = estimatorSpeeds.reduce((a, b) => a + b, 0) / estimatorSpeeds.length;
      }
    }

    // Check for missed follow-ups
    const { data: tasks } = await supabase
      .from("tasks")
      .select("status, due_at, completed_at, created_at")
      .eq("lead_id", lead_id)
      .order("created_at", { ascending: false });

    const completedStatuses = ["done", "completed"];
    const missedFollowUps = tasks?.filter(t => 
      !completedStatuses.includes(t.status) && 
      t.due_at && 
      new Date(t.due_at) < new Date()
    ).length || 0;

    // Calculate stage stuck time (hours since last status change)
    let stageHours: number | null = null;
    if (lead.status_updated_at) {
      const statusUpdatedAt = new Date(lead.status_updated_at);
      const now = new Date();
      stageHours = (now.getTime() - statusUpdatedAt.getTime()) / (1000 * 60 * 60);
    }

    // Calculate proposal delay
    let proposalDelayHours: number | null = null;
    const { data: threads } = await supabase
      .from("inbox_threads")
      .select("id")
      .eq("lead_id", lead_id)
      .limit(10);

    const threadIds = threads?.map(t => t.id) || [];
    if (threadIds.length > 0) {
      const { data: proposals } = await supabase
        .from("proposals")
        .select("sent_at, email_sent_at, created_at, status")
        .in("thread_id", threadIds)
        .in("status", ["sent", "approved", "won"])
        .order("created_at", { ascending: true })
        .limit(1);

      if (proposals && proposals.length > 0) {
        const firstProposal = proposals[0];
        const proposalSentAt = firstProposal.sent_at || 
                               firstProposal.email_sent_at || 
                               firstProposal.created_at;
        
        if (proposalSentAt && lead.created_at) {
          const proposalSentTime = new Date(proposalSentAt);
          const leadCreatedTime = new Date(lead.created_at);
          proposalDelayHours = (proposalSentTime.getTime() - leadCreatedTime.getTime()) / (1000 * 60 * 60);
        }
      }
    }

    // Get estimator performance grade
    let estimatorGrade: string | null = null;
    if (lead.estimator_id) {
      const { data: scorecard } = await supabase
        .from("estimator_scorecards")
        .select("final_letter_grade")
        .eq("estimator_id", lead.estimator_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (scorecard?.final_letter_grade) {
        estimatorGrade = scorecard.final_letter_grade;
      }
    }

    // Calculate probability change (if we have history)
    // For now, we'll use a simple approach - check if probability is trending down
    let probabilityDrop: number | null = null;
    // This would ideally come from a probability_history table, but for v1 we'll skip it

    // ============================================================================
    // 2. BUILD PROMPT FOR OPENAI
    // ============================================================================

    const prompt = `You are part of a roofing sales AI system called SmartSend. Your job is to explain WHY a lead has a specific job probability score.

Lead Details:
- Job Probability: ${lead.job_probability || 0}%
- Heat Score: ${lead.heat_score || 0}
- Homeowner Tone: ${latestTone || "unknown"}
- Reply Count: ${replyCount}
- Average Homeowner Reply Speed: ${avgReplySpeedHours ? `${avgReplySpeedHours.toFixed(1)} hours` : "N/A"}
- Average Estimator Reply Speed: ${avgEstimatorReplySpeedHours ? `${avgEstimatorReplySpeedHours.toFixed(1)} hours` : "N/A"}
- Missed Follow-ups: ${missedFollowUps}
- Stage Stuck Time: ${stageHours ? `${stageHours.toFixed(1)} hours` : "N/A"}
- Job Value: ${lead.estimated_job_value ? `$${lead.estimated_job_value.toLocaleString()}` : "Unknown"}
- Proposal Delay: ${proposalDelayHours ? `${proposalDelayHours.toFixed(1)} hours` : "N/A"}
- Risk Category: ${lead.risk_category || "unknown"}
- Risk Score: ${lead.risk_score || 0}
- Estimator Performance Grade: ${estimatorGrade || "N/A"}
- Pipeline Stage: ${lead.status || "unknown"}
- Job Type: ${lead.job_type || "unknown"}

Explain why this job is at ${lead.job_probability || 0}% probability. Be specific, actionable, and honest. Roofers want to understand:
1. What's helping this job close (positive factors)
2. What's hurting this job (negative factors)
3. What risks could cause it to fail (risk drivers)
4. What actions they should take to increase close likelihood

Return your response as JSON with this exact structure:
{
  "positive_factors": ["array of strings explaining positive factors"],
  "negative_factors": ["array of strings explaining negative factors"],
  "risk_drivers": ["array of strings explaining risks"],
  "action_recommendations": ["array of specific, actionable recommendations"],
  "confidence": 85
}

The confidence score (0-100) indicates how confident you are in this explanation based on available data.`;

    // ============================================================================
    // 3. CALL OPENAI API
    // ============================================================================

    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiApiKey) {
      return new Response(
        JSON.stringify({ error: "OPENAI_API_KEY not configured" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0.3, // Lower temperature for more consistent explanations
      }),
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      console.error("OpenAI API error:", errorText);
      return new Response(
        JSON.stringify({ error: "Failed to generate explanation", details: errorText }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const openaiData = await openaiResponse.json();
    const explanationText = openaiData.choices?.[0]?.message?.content || "{}";
    
    let explanation: any;
    try {
      explanation = JSON.parse(explanationText);
    } catch (parseError) {
      console.error("Failed to parse OpenAI response:", explanationText);
      return new Response(
        JSON.stringify({ error: "Failed to parse explanation" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Validate explanation structure
    if (!explanation.positive_factors || !explanation.negative_factors || 
        !explanation.risk_drivers || !explanation.action_recommendations || 
        typeof explanation.confidence !== "number") {
      return new Response(
        JSON.stringify({ error: "Invalid explanation structure", explanation }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // ============================================================================
    // 4. UPDATE LEAD WITH EXPLANATION
    // ============================================================================

    const { error: updateError } = await supabase
      .from("leads")
      .update({
        probability_explanation: explanation,
        probability_confidence: explanation.confidence,
      })
      .eq("id", lead_id);

    if (updateError) {
      console.error("Error updating lead:", updateError);
      return new Response(
        JSON.stringify({ error: updateError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // ============================================================================
    // 5. LOG TO JOB TIMELINES
    // ============================================================================

    await supabase.from("job_timelines").insert({
      lead_id,
      event_type: "probability_explained",
      event_data: {
        probability: lead.job_probability,
        confidence: explanation.confidence,
        generated_at: new Date().toISOString(),
      },
    });

    return new Response(
      JSON.stringify({
        ok: true,
        explanation,
        confidence: explanation.confidence,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in generate-probability-explanation:", error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});









































