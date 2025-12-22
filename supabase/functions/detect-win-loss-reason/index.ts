// Block 22210 — SmartSend Roofing Loss Reason Detector v1
// Edge Function: Detect Win/Loss Reasons (Enhanced with Comprehensive Analysis)
// Automatically detects why jobs are won or lost using AI analysis
// Includes detailed breakdown: estimator factors, homeowner factors, process factors, recommendations

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const openaiApiKey = Deno.env.get("OPENAI_API_KEY")!;

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false },
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
      {
        status: 405,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  try {
    const { lead_id, status } = await req.json();

    if (!lead_id || !status) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: lead_id and status" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (status !== "won" && status !== "lost") {
      return new Response(
        JSON.stringify({ error: "Status must be 'won' or 'lost'" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Fetch lead data
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("*")
      .eq("id", lead_id)
      .single();

    if (leadError || !lead) {
      console.error("Lead fetch error:", leadError);
      return new Response(
        JSON.stringify({ error: "Lead not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Gather data for AI analysis
    const analysisData = await gatherAnalysisData(lead_id, lead);

    // Call OpenAI to detect reason
    const aiResult = await detectReasonWithAI(status, analysisData);

    // Update lead with detected reason
    const updateData: any = {
      reason_confidence: aiResult.confidence,
    };

    if (status === "won") {
      updateData.win_reason = aiResult.reason;
    } else {
      updateData.loss_reason = aiResult.reason;
      // Block 22210: Add detailed loss analysis
      if (aiResult.loss_reason_details) {
        updateData.loss_reason_details = aiResult.loss_reason_details;
      }
      if (aiResult.analysis) {
        updateData.loss_analysis = aiResult.analysis;
      }
    }

    const { error: updateError } = await supabase
      .from("leads")
      .update(updateData)
      .eq("id", lead_id);

    if (updateError) {
      console.error("Update error:", updateError);
      return new Response(
        JSON.stringify({ error: "Failed to update lead" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Block 22210: Log to audit trail and job_timelines
    await supabase.from("lead_audit_logs").insert({
      lead_id,
      event_type: status === "won" ? "win_reason_detected" : "loss_reason_detected",
      actor_type: "system",
      event_data: {
        reason: aiResult.reason,
        confidence: aiResult.confidence,
        loss_reason_details: aiResult.loss_reason_details || null,
        analysis: aiResult.analysis || null,
      },
    });

    // Add timeline event for loss reason detection
    if (status === "lost") {
      await supabase.from("job_timelines").insert({
        lead_id,
        event_type: "loss_reason_detected",
        event_category: "ai_intelligence",
        event_summary: `Lost: ${aiResult.reason}`,
        event_data: {
          reason: aiResult.reason,
          details: aiResult.loss_reason_details,
          confidence: aiResult.confidence,
          analysis: aiResult.analysis,
        },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        reason: aiResult.reason,
        confidence: aiResult.confidence,
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
    console.error("Error in detect-win-loss-reason:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});

async function gatherAnalysisData(leadId: string, lead: any) {
  const data: any = {
    lead_info: {
      status: lead.status,
      estimated_job_value: lead.estimated_job_value,
      heat_score: lead.heat_score,
      job_probability: lead.job_probability,
      risk_score: lead.risk_score,
      risk_category: lead.risk_category,
      created_at: lead.created_at,
      updated_at: lead.updated_at,
      pipeline_stage: lead.pipeline_stage,
      lead_source: lead.lead_source,
      owner_id: lead.owner_id,
    },
    messages: [],
    transcript_messages: [],
    tone_history: [],
    estimator_performance: null,
    followup_metrics: {
      missed_followups: 0,
      followup_rate: null,
      proposal_delay_hours: null,
      response_time_hours: null,
    },
    intent_classification: null,
    probability_changes: [],
    risk_events: [],
    intelligence_scores: {},
    timeline_events: [],
  };

  // Block 22210: Fetch transcript_messages (comprehensive conversation intelligence)
  const { data: transcriptMessages } = await supabase
    .from("transcript_messages")
    .select("id, sender_type, sender_name, message_text, tone, intent, sentiment_score, experience_impact, created_at")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: true })
    .limit(100);

  if (transcriptMessages && transcriptMessages.length > 0) {
    data.transcript_messages = transcriptMessages.map((msg: any) => ({
      sender_type: msg.sender_type,
      sender_name: msg.sender_name,
      message_text: msg.message_text,
      tone: msg.tone,
      intent: msg.intent,
      sentiment_score: msg.sentiment_score,
      experience_impact: msg.experience_impact,
      created_at: msg.created_at,
    }));
  }

  // Fetch messages (email_messages or message_logs) as fallback
  const { data: emailMessages } = await supabase
    .from("email_messages")
    .select("id, direction, subject, body_text, received_at, created_at, intent_label")
    .eq("lead_id", leadId)
    .order("received_at", { ascending: true })
    .limit(50);

  if (emailMessages && emailMessages.length > 0) {
    data.messages = emailMessages.map((msg: any) => ({
      direction: msg.direction,
      subject: msg.subject,
      snippet: msg.body_text?.substring(0, 200) || "",
      received_at: msg.received_at,
      intent: msg.intent_label,
    }));
  } else {
    // Fallback to message_logs
    const { data: messageLogs } = await supabase
      .from("message_logs")
      .select("id, subject, body_text, created_at")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: true })
      .limit(50);

    if (messageLogs) {
      data.messages = messageLogs.map((msg: any) => ({
        direction: "outbound",
        subject: msg.subject,
        snippet: msg.body_text?.substring(0, 200) || "",
        received_at: msg.created_at,
      }));
    }
  }

  // Fetch tone history from lead_activities or lead_audit_logs
  const { data: toneEvents } = await supabase
    .from("lead_audit_logs")
    .select("event_data, created_at")
    .eq("lead_id", leadId)
    .eq("event_type", "ai_tone_classified")
    .order("created_at", { ascending: true });

  if (toneEvents) {
    data.tone_history = toneEvents.map((event: any) => ({
      tone: event.event_data?.tone || null,
      confidence: event.event_data?.confidence || null,
      timestamp: event.created_at,
    }));
  }

  // Fetch estimator performance (try owner_id or estimator_id)
  const estimatorId = lead.owner_id || lead.estimator_id;
  if (estimatorId) {
    const { data: estimator } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .eq("id", estimatorId)
      .single();

    if (estimator) {
      // Get estimator performance metrics (if available from estimator_scorecard)
      const { data: scorecard } = await supabase
        .from("estimator_scorecards")
        .select("response_time_avg, followup_rate, close_rate")
        .eq("estimator_id", estimatorId)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      data.estimator_performance = {
        name: estimator.full_name || estimator.email,
        response_time_avg: scorecard?.response_time_avg || null,
        followup_rate: scorecard?.followup_rate || null,
        close_rate: scorecard?.close_rate || null,
      };
    }
  }

  // Block 22210: Fetch intelligence scores from lead_full_intelligence_view if available
  try {
    const { data: intelligence } = await supabase
      .from("lead_full_intelligence_view")
      .select("*")
      .eq("lead_id", leadId)
      .single();

    if (intelligence) {
      data.intelligence_scores = {
        job_health_score: intelligence.job_health_score,
        job_health_trend: intelligence.job_health_trend,
        momentum_score: intelligence.momentum_score,
        momentum_trend: intelligence.momentum_trend,
        homeowner_experience_score: intelligence.homeowner_experience_score,
        experience_trend: intelligence.experience_trend,
        days_since_created: intelligence.days_since_created,
        days_since_last_message: intelligence.days_since_last_message,
        days_since_last_reply: intelligence.days_since_last_reply,
        estimator_performance: intelligence.estimator_performance,
        source_quality_score: intelligence.source_quality_score,
        source_category: intelligence.source_category,
      };
    }
  } catch (err) {
    // View might not exist, continue without it
    console.log("lead_full_intelligence_view not available:", err);
  }

  // Fetch action queue metrics
  const { data: actions } = await supabase
    .from("action_queue")
    .select("action_type, status, due_at, completed_at, created_at")
    .eq("lead_id", leadId);

  if (actions && actions.length > 0) {
    const completed = actions.filter((a: any) => a.status === "completed").length;
    const total = actions.length;
    const missed = actions.filter((a: any) => {
      if (!a.due_at) return false;
      const dueDate = new Date(a.due_at);
      const now = new Date();
      return dueDate < now && a.status !== "completed";
    }).length;

    data.followup_metrics.missed_followups = missed;
    data.followup_metrics.followup_rate = total > 0 ? (completed / total) * 100 : null;

    // Calculate proposal delay (time from estimate_completed to proposal_sent)
    const estimateCompleted = actions.find((a: any) => a.action_type === "send_proposal" && a.completed_at);
    if (estimateCompleted && estimateCompleted.completed_at) {
      const completedAt = new Date(estimateCompleted.completed_at);
      const createdAt = new Date(estimateCompleted.created_at);
      const delayMs = completedAt.getTime() - createdAt.getTime();
      data.followup_metrics.proposal_delay_hours = delayMs / (1000 * 60 * 60);
    }

    // Calculate response time (time from homeowner message to estimator response)
    if (data.transcript_messages && data.transcript_messages.length > 0) {
      const homeownerMessages = data.transcript_messages.filter((m: any) => m.sender_type === "homeowner");
      const estimatorMessages = data.transcript_messages.filter((m: any) => m.sender_type === "estimator");
      
      if (homeownerMessages.length > 0 && estimatorMessages.length > 0) {
        const lastHomeownerMsg = homeownerMessages[homeownerMessages.length - 1];
        const nextEstimatorMsg = estimatorMessages.find((m: any) => 
          new Date(m.created_at) > new Date(lastHomeownerMsg.created_at)
        );
        
        if (nextEstimatorMsg) {
          const responseTimeMs = new Date(nextEstimatorMsg.created_at).getTime() - new Date(lastHomeownerMsg.created_at).getTime();
          data.followup_metrics.response_time_hours = responseTimeMs / (1000 * 60 * 60);
        }
      }
    }
  }

  // Block 22210: Fetch timeline events for context
  const { data: timelineEvents } = await supabase
    .from("job_timelines")
    .select("event_type, event_category, event_summary, event_data, created_at")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: true })
    .limit(50);

  if (timelineEvents) {
    data.timeline_events = timelineEvents.map((event: any) => ({
      event_type: event.event_type,
      event_category: event.event_category,
      event_summary: event.event_summary,
      created_at: event.created_at,
    }));
  }

  // Fetch intent classification
  const { data: intentEvents } = await supabase
    .from("lead_audit_logs")
    .select("event_data, created_at")
    .eq("lead_id", leadId)
    .eq("event_type", "ai_intent_classified")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (intentEvents) {
    data.intent_classification = {
      intent: intentEvents.event_data?.intent || null,
      confidence: intentEvents.event_data?.confidence || null,
      timestamp: intentEvents.created_at,
    };
  }

  // Fetch probability changes from audit logs
  const { data: probEvents } = await supabase
    .from("lead_audit_logs")
    .select("event_data, created_at")
    .eq("lead_id", leadId)
    .eq("event_type", "automation_probability_update")
    .order("created_at", { ascending: true });

  if (probEvents) {
    data.probability_changes = probEvents.map((event: any) => ({
      old_probability: event.event_data?.old_probability || null,
      new_probability: event.event_data?.new_probability || null,
      timestamp: event.created_at,
    }));
  }

  // Fetch risk events
  const { data: riskEvents } = await supabase
    .from("lead_audit_logs")
    .select("event_data, created_at")
    .eq("lead_id", leadId)
    .eq("event_type", "automation_risk_update")
    .order("created_at", { ascending: true });

  if (riskEvents) {
    data.risk_events = riskEvents.map((event: any) => ({
      risk_score: event.event_data?.risk_score || null,
      risk_category: event.event_data?.risk_category || null,
      timestamp: event.created_at,
    }));
  }

  return data;
}

async function detectReasonWithAI(status: "won" | "lost", analysisData: any): Promise<{ reason: string; confidence: number; loss_reason_details?: string; analysis?: any }> {
  const statusLabel = status === "won" ? "win" : "loss";
  const isLoss = status === "lost";

  // Build comprehensive prompt for loss analysis
  const transcriptSection = analysisData.transcript_messages && analysisData.transcript_messages.length > 0
    ? `TRANSCRIPT MESSAGES (${analysisData.transcript_messages.length} total - Full conversation intelligence):
${analysisData.transcript_messages.slice(-20).map((msg: any, i: number) => 
  `${i + 1}. [${msg.sender_type}] ${msg.sender_name || "Unknown"}: ${msg.message_text.substring(0, 300)}
   Tone: ${msg.tone || "unknown"}, Intent: ${msg.intent || "unknown"}, Sentiment: ${msg.sentiment_score || "unknown"}`
).join("\n\n")}`
    : "";

  const prompt = `You are SmartSend AI analyzing why a roofing job was ${status === "won" ? "WON" : "LOST"}.

${isLoss ? `Your job: determine **exactly why** it was lost. Use:
- tone trends
- momentum decline patterns
- experience score changes
- risk signals
- proposal delays
- follow-up delays
- ghosting behavior
- estimator communication quality
- homeowner objections
- transcript messages
- lead source pattern
- estimator performance
- probability trend
- stage duration` : ""}

LEAD INFORMATION:
- Status: ${analysisData.lead_info.status}
- Pipeline Stage: ${analysisData.lead_info.pipeline_stage || "unknown"}
- Estimated Job Value: $${analysisData.lead_info.estimated_job_value || "unknown"}
- Heat Score: ${analysisData.lead_info.heat_score || "unknown"}
- Job Probability: ${analysisData.lead_info.job_probability || "unknown"}%
- Risk Score: ${analysisData.lead_info.risk_score || "unknown"}
- Risk Category: ${analysisData.lead_info.risk_category || "unknown"}
- Lead Source: ${analysisData.lead_info.lead_source || "unknown"}
- Created: ${analysisData.lead_info.created_at}
- Updated: ${analysisData.lead_info.updated_at}

${transcriptSection}

MESSAGES (${analysisData.messages.length} total):
${analysisData.messages.slice(-10).map((msg: any, i: number) => 
  `${i + 1}. [${msg.direction}] ${msg.subject || "No subject"} - ${msg.snippet}`
).join("\n")}

TONE HISTORY:
${analysisData.tone_history.length > 0 
  ? analysisData.tone_history.map((t: any) => `${t.tone} (${t.confidence}%) at ${t.timestamp}`).join("\n")
  : "No tone history available"
}

INTELLIGENCE SCORES:
${Object.keys(analysisData.intelligence_scores).length > 0
  ? Object.entries(analysisData.intelligence_scores).map(([key, value]) => `${key}: ${value}`).join("\n")
  : "No intelligence scores available"
}

ESTIMATOR PERFORMANCE:
${analysisData.estimator_performance 
  ? `Name: ${analysisData.estimator_performance.name}\nResponse Time Avg: ${analysisData.estimator_performance.response_time_avg || "unknown"}\nFollow-up Rate: ${analysisData.estimator_performance.followup_rate || "unknown"}%\nClose Rate: ${analysisData.estimator_performance.close_rate || "unknown"}%`
  : "No estimator assigned"
}

FOLLOW-UP METRICS:
- Missed Follow-ups: ${analysisData.followup_metrics.missed_followups}
- Follow-up Rate: ${analysisData.followup_metrics.followup_rate || "unknown"}%
- Proposal Delay: ${analysisData.followup_metrics.proposal_delay_hours ? `${Math.round(analysisData.followup_metrics.proposal_delay_hours)} hours` : "unknown"}
- Response Time: ${analysisData.followup_metrics.response_time_hours ? `${Math.round(analysisData.followup_metrics.response_time_hours)} hours` : "unknown"}

INTENT CLASSIFICATION:
${analysisData.intent_classification 
  ? `${analysisData.intent_classification.intent} (${analysisData.intent_classification.confidence || "unknown"}% confidence)`
  : "No intent classification available"
}

PROBABILITY CHANGES:
${analysisData.probability_changes.length > 0
  ? analysisData.probability_changes.map((p: any) => `${p.old_probability}% → ${p.new_probability}% at ${p.timestamp}`).join("\n")
  : "No probability changes tracked"
}

RISK EVENTS:
${analysisData.risk_events.length > 0
  ? analysisData.risk_events.map((r: any) => `${r.risk_category} (score: ${r.risk_score}) at ${r.timestamp}`).join("\n")
  : "No risk events tracked"
}

TIMELINE EVENTS:
${analysisData.timeline_events && analysisData.timeline_events.length > 0
  ? analysisData.timeline_events.slice(-10).map((e: any) => `${e.event_type} (${e.event_category}): ${e.event_summary}`).join("\n")
  : "No timeline events available"
}

${isLoss ? `Based on this comprehensive data, determine the EXACT reason why this job was lost.

LOSS REASON CATEGORIES (choose the most accurate):
Homeowner-Caused:
- Chose cheaper competitor
- Chose local company they trust
- Chose company with better warranty offering
- Insurance didn't approve / fell through
- Project postponed
- Chose friend/family contractor
- Already hired someone else before we followed up

Estimator-Caused:
- Slow response
- Proposal delivered too late
- Weak follow-up
- Failure to handle objections
- Tone mismatch
- Homeowner frustration caused by estimator
- Missed critical question (insurance, timing, materials)
- Poor explanation of scope or pricing

Process-Caused:
- System delay
- Inspection took too long
- Miscommunication
- Stage stagnation
- Proposal error
- Wrong estimator assigned

Market-Caused:
- Price-sensitive customer
- Storm market saturation
- Competing offers extremely low
- Not enough budget

Other:
- Homeowner ghosted AND low momentum
- Homeowner unresponsive despite positive early signals

Respond with JSON:
{
  "reason": "short label (max 50 chars)",
  "loss_reason_details": "detailed explanation (2-3 sentences)",
  "analysis": {
    "estimator_factors": ["factor1", "factor2"],
    "homeowner_factors": ["factor1", "factor2"],
    "process_factors": ["factor1", "factor2"],
    "recommendations": ["recommendation1", "recommendation2"]
  },
  "confidence": 0-100
}` : `Based on this data, determine the most likely win reason. Common win reasons include:
- Fast response time
- Great communication
- Competitive price range
- Strong trust with homeowner
- Insurance approval
- Positive homeowner tone
- Estimator performance
- Proposal speed
- SmartSend follow-up rescue

Respond with JSON only:
{
  "reason": "concise reason text (max 50 characters)",
  "confidence": 0-100
}`}`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.3,
        messages: [
          {
            role: "system",
            content: "You are an AI assistant that analyzes roofing job win/loss reasons. Return only valid JSON, no markdown, no code blocks.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI API error:", errorText);
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const json = await response.json();
    const content = json.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("No content in OpenAI response");
    }

    const parsed = JSON.parse(content);

    const result: any = {
      reason: String(parsed.reason || `Unknown ${statusLabel} reason`).substring(0, 100),
      confidence: Math.max(0, Math.min(100, Number(parsed.confidence) || 50)),
    };

    // Block 22210: Add detailed analysis for loss reasons
    if (isLoss) {
      if (parsed.loss_reason_details) {
        result.loss_reason_details = String(parsed.loss_reason_details).substring(0, 500);
      }
      if (parsed.analysis) {
        result.analysis = {
          estimator_factors: Array.isArray(parsed.analysis.estimator_factors) 
            ? parsed.analysis.estimator_factors.slice(0, 10)
            : [],
          homeowner_factors: Array.isArray(parsed.analysis.homeowner_factors)
            ? parsed.analysis.homeowner_factors.slice(0, 10)
            : [],
          process_factors: Array.isArray(parsed.analysis.process_factors)
            ? parsed.analysis.process_factors.slice(0, 10)
            : [],
          recommendations: Array.isArray(parsed.analysis.recommendations)
            ? parsed.analysis.recommendations.slice(0, 10)
            : [],
        };
      }
    }

    return result;
  } catch (error) {
    console.error("AI detection error:", error);
    // Return fallback reason
    const fallback: any = {
      reason: status === "won" ? "Job won" : "Job lost",
      confidence: 30,
    };
    
    if (isLoss) {
      fallback.loss_reason_details = "Unable to determine detailed reason";
      fallback.analysis = {
        estimator_factors: [],
        homeowner_factors: [],
        process_factors: [],
        recommendations: ["Review lead manually for insights"],
      };
    }
    
    return fallback;
  }
}

