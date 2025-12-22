// @ts-nocheck
// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

interface DealCoachRequest {
  deal_id?: string;
  workspace_id?: string;
  trigger?: "deal_update" | "daily_report" | "manual" | "deal_page_view";
  brand_id?: string;
}

Deno.serve(async (req) => {
  try {
    const body: DealCoachRequest = await req.json().catch(() => ({}));
    const { deal_id, workspace_id, trigger = "manual", brand_id } = body;

    // Handle daily report generation
    if (trigger === "daily_report") {
      if (!workspace_id) {
        return new Response(
          JSON.stringify({ error: "workspace_id required for daily report" }),
          { status: 400, headers: { "content-type": "application/json" } }
        );
      }
      
      const result = await generateDailyReport(workspace_id, brand_id);
      return new Response(
        JSON.stringify({ ok: true, report: result }),
        { headers: { "content-type": "application/json" } }
      );
    }

    // Handle single deal analysis
    if (deal_id) {
      const result = await analyzeDeal(deal_id);
      return new Response(
        JSON.stringify({ ok: true, insights: result }),
        { headers: { "content-type": "application/json" } }
      );
    }

    // Handle workspace-wide analysis (all open deals)
    if (workspace_id) {
      const result = await analyzeWorkspaceDeals(workspace_id, brand_id);
      return new Response(
        JSON.stringify({ ok: true, analyzed: result.analyzed, insights: result.insights }),
        { headers: { "content-type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "deal_id or workspace_id required" }),
      { status: 400, headers: { "content-type": "application/json" } }
    );
  } catch (error) {
    console.error("AI Deal Coach error:", error);
    return new Response(
      JSON.stringify({ ok: false, error: String(error) }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
});

async function analyzeDeal(dealId: string): Promise<any> {
  console.log(`Analyzing deal ${dealId}...`);

  // Get deal data
  const { data: deal, error: dealError } = await supabase
    .from("deals")
    .select("*")
    .eq("id", dealId)
    .single();

  if (dealError || !deal) {
    throw new Error(`Deal not found: ${dealId}`);
  }

  // Get lead data
  const { data: lead } = await supabase
    .from("leads")
    .select("*")
    .eq("id", deal.lead_id)
    .single();

  // Calculate win probability using database function
  const { data: probData } = await supabase.rpc(
    "calculate_deal_win_probability",
    { p_deal_id: dealId }
  );

  const winProbability = probData?.win_probability || deal.probability || 20;
  const confidence = probData?.confidence || 0.5;

  // Detect risk factors
  const { data: riskData } = await supabase.rpc(
    "detect_deal_risk_factors",
    { p_deal_id: dealId }
  );

  const riskTags = riskData?.risk_tags || [];
  const riskFactors = riskData?.risks || [];

  // Get communication history
  const { data: communications } = await supabase
    .from("campaign_logs")
    .select("snippet, direction, created_at, event")
    .eq("lead_id", deal.lead_id)
    .order("created_at", { ascending: false })
    .limit(20);

  // Get meeting notes
  const { data: meetingNotes } = await supabase
    .from("deal_notes")
    .select("note_text, created_at")
    .eq("deal_id", dealId)
    .order("created_at", { ascending: false })
    .limit(10);

  // Get deal activity
  const { data: activities } = await supabase
    .from("deal_activity")
    .select("*")
    .eq("deal_id", dealId)
    .order("created_at", { ascending: false })
    .limit(20);

  // Generate AI summary
  const summary = await generateDealSummary(deal, lead, communications, meetingNotes, activities);

  // Generate next step recommendation
  const nextStep = await generateNextStep(deal, lead, communications, winProbability, riskTags);

  // Detect objections
  const objections = await detectObjections(communications, meetingNotes);
  const objectionResponses = await generateObjectionResponses(objections, deal, lead);

  // Determine SDR priority
  const priority = calculatePriority(winProbability, riskTags, deal.stage);

  // Generate message template
  const messageTemplate = await generateMessageTemplate(deal, lead, nextStep, objections);

  // Prepare insights
  const insights = {
    deal_id: dealId,
    workspace_id: deal.workspace_id,
    win_probability: winProbability,
    confidence_score: confidence,
    summary,
    risk_tags: riskTags,
    risk_factors: riskFactors,
    recommended_next_action: nextStep.action,
    recommended_action_type: nextStep.type,
    recommended_timing: nextStep.timing,
    recommended_timing_reason: nextStep.timing_reason,
    detected_objections: objections,
    objection_responses: objectionResponses,
    sdr_priority: priority.level,
    priority_reason: priority.reason,
    suggested_message_template: messageTemplate.body,
    suggested_message_subject: messageTemplate.subject,
    analysis_factors: probData?.factors || {},
    last_analyzed_at: new Date().toISOString(),
  };

  // Upsert insights
  const { error: upsertError } = await supabase
    .from("deal_coach_insights")
    .upsert(insights, { onConflict: "deal_id" });

  if (upsertError) {
    console.error("Error upserting insights:", upsertError);
  }

  // Log activity
  await supabase.from("deal_coach_activity").insert({
    deal_id: dealId,
    workspace_id: deal.workspace_id,
    action_type: "analyzed",
    action_details: {
      win_probability,
      confidence,
      risk_count: riskTags.length,
    },
  });

  return insights;
}

async function generateDealSummary(
  deal: any,
  lead: any,
  communications: any[],
  meetingNotes: any[],
  activities: any[]
): Promise<string> {
  if (!OPENAI_API_KEY) {
    // Fallback summary without AI
    const lastActivity = activities?.[0];
    const lastComm = communications?.find((c) => c.direction === "inbound");
    return `Deal in ${deal.stage} stage with ${deal.probability || 0}% probability. ${
      lastComm ? `Last communication: ${lastComm.created_at}` : "No recent communication."
    }`;
  }

  try {
    const commsText = communications
      ?.slice(0, 5)
      .map((c) => `${c.direction}: ${c.snippet?.slice(0, 100)}`)
      .join("\n");

    const notesText = meetingNotes?.map((n) => n.note_text).join("\n").slice(0, 500);

    const prompt = `Analyze this sales deal and provide a concise 2-3 sentence summary:

Deal Stage: ${deal.stage}
Deal Value: $${deal.value || 0}
Lead: ${lead?.first_name} ${lead?.last_name} at ${lead?.company || "Unknown"}
Recent Communications:
${commsText || "None"}

Meeting Notes:
${notesText || "None"}

Provide a summary highlighting: interest level, key signals, and current status.`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 200,
        temperature: 0.7,
      }),
    });

    const data = await response.json();
    return data.choices?.[0]?.message?.content || "Summary unavailable.";
  } catch (error) {
    console.error("Error generating summary:", error);
    return "Summary generation failed.";
  }
}

async function generateNextStep(
  deal: any,
  lead: any,
  communications: any[],
  winProbability: number,
  riskTags: string[]
): Promise<any> {
  const lastComm = communications?.[0];
  const daysSinceComm = lastComm
    ? Math.floor((Date.now() - new Date(lastComm.created_at).getTime()) / (1000 * 60 * 60 * 24))
    : 999;

  let action = "";
  let type = "other";
  let timing = new Date();
  let timingReason = "";

  // Determine next step based on stage and context
  switch (deal.stage) {
    case "New":
      action = "Send qualification email to understand their needs";
      type = "send_followup_email";
      timing = new Date(Date.now() + 24 * 60 * 60 * 1000); // Tomorrow
      timingReason = "Early stage - follow up within 24 hours";
      break;

    case "Qualified":
      action = "Schedule a discovery call to dive deeper";
      type = "schedule_demo";
      timing = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000); // 2 days
      timingReason = "Qualified lead - schedule call within 48 hours";
      break;

    case "Meeting Scheduled":
      action = "Prepare meeting agenda and review their background";
      type = "other";
      timing = new Date(Date.now() + 12 * 60 * 60 * 1000); // 12 hours
      timingReason = "Meeting coming up - prepare in advance";
      break;

    case "Proposal Sent":
      if (daysSinceComm > 3) {
        action = "Follow up on the proposal - check if they have questions";
        type = "send_followup_email";
        timing = new Date(Date.now() + 4 * 60 * 60 * 1000); // 4 hours
        timingReason = "Proposal sent - follow up if no response in 3+ days";
      } else {
        action = "Wait for response on proposal";
        type = "other";
        timing = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000); // 3 days
        timingReason = "Give them time to review proposal";
      }
      break;

    case "Negotiation":
      if (daysSinceComm > 2) {
        action = "Check in on negotiation status";
        type = "call_attempt";
        timing = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours
        timingReason = "Active negotiation - check in if quiet for 2+ days";
      } else {
        action = "Continue negotiation discussions";
        type = "other";
        timing = new Date(Date.now() + 1 * 24 * 60 * 60 * 1000); // 1 day
        timingReason = "Keep momentum in negotiation";
      }
      break;

    default:
      if (riskTags.some((tag) => tag.includes("No reply"))) {
        action = "Re-engage with a short check-in email";
        type = "send_followup_email";
        timing = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours
        timingReason = "No reply detected - re-engage quickly";
      } else {
        action = "Review deal status and plan next touchpoint";
        type = "other";
        timing = new Date(Date.now() + 24 * 60 * 60 * 1000); // Tomorrow
        timingReason = "Standard follow-up cycle";
      }
  }

  return { action, type, timing: timing.toISOString(), timing_reason: timingReason };
}

async function detectObjections(communications: any[], meetingNotes: any[]): Promise<string[]> {
  const objections: string[] = [];
  const objectionKeywords = [
    "price",
    "expensive",
    "cost",
    "budget",
    "timing",
    "too early",
    "too late",
    "approval",
    "decision maker",
    "comparing",
    "competitor",
    "alternative",
    "not a priority",
    "happy with current",
    "already have",
  ];

  const allText = [
    ...(communications?.map((c) => c.snippet || "").join(" ") || ""),
    ...(meetingNotes?.map((n) => n.note_text || "").join(" ") || ""),
  ].join(" ").toLowerCase();

  if (allText.includes("price") || allText.includes("expensive") || allText.includes("cost")) {
    objections.push("price");
  }
  if (allText.includes("timing") || allText.includes("too early") || allText.includes("too late")) {
    objections.push("timing");
  }
  if (allText.includes("budget") || allText.includes("approval") || allText.includes("decision maker")) {
    objections.push("budget");
  }
  if (allText.includes("comparing") || allText.includes("competitor") || allText.includes("alternative")) {
    objections.push("competitor");
  }
  if (allText.includes("not a priority") || allText.includes("not priority")) {
    objections.push("not_priority");
  }
  if (allText.includes("happy with current") || allText.includes("already have")) {
    objections.push("existing_solution");
  }

  return objections;
}

async function generateObjectionResponses(
  objections: string[],
  deal: any,
  lead: any
): Promise<Record<string, string>> {
  const responses: Record<string, string> = {};

  if (!OPENAI_API_KEY) {
    // Fallback responses
    objections.forEach((obj) => {
      responses[obj] = `I understand your concern about ${obj}. Let me address that...`;
    });
    return responses;
  }

  for (const objection of objections) {
    try {
      const prompt = `Generate a professional, empathetic response to this sales objection:

Objection: ${objection}
Deal Stage: ${deal.stage}
Company: ${lead?.company || "Unknown"}

Provide a 2-3 sentence response that acknowledges the concern and offers value.`;

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 150,
          temperature: 0.7,
        }),
      });

      const data = await response.json();
      responses[objection] = data.choices?.[0]?.message?.content || `I understand your concern about ${objection}.`;
    } catch (error) {
      console.error(`Error generating response for ${objection}:`, error);
      responses[objection] = `I understand your concern about ${objection}. Let me address that.`;
    }
  }

  return responses;
}

function calculatePriority(
  winProbability: number,
  riskTags: string[],
  stage: string
): { level: string; reason: string } {
  if (winProbability >= 70 && riskTags.length === 0) {
    return { level: "high", reason: "High win probability with no risks" };
  }
  if (riskTags.some((tag) => tag.includes("No reply") && tag.includes("14"))) {
    return { level: "urgent", reason: "No reply for 14+ days" };
  }
  if (stage === "Negotiation") {
    return { level: "high", reason: "Active negotiation stage" };
  }
  if (winProbability >= 60) {
    return { level: "medium", reason: "Good win probability" };
  }
  if (riskTags.length > 2) {
    return { level: "high", reason: "Multiple risk factors detected" };
  }
  return { level: "medium", reason: "Standard priority" };
}

async function generateMessageTemplate(
  deal: any,
  lead: any,
  nextStep: any,
  objections: string[]
): Promise<{ subject: string; body: string }> {
  const name = lead?.first_name || "there";
  const company = lead?.company || "";

  let subject = "";
  let body = "";

  switch (nextStep.type) {
    case "send_followup_email":
      subject = `Quick check-in - ${company}`;
      body = `Hi ${name},\n\nJust wanted to follow up on our conversation about [topic]. ${nextStep.action}\n\nBest regards`;
      break;
    case "send_pricing_reminder":
      subject = `Pricing details - ${company}`;
      body = `Hi ${name},\n\nAs discussed, here are the pricing details...`;
      break;
    case "call_attempt":
      subject = `Quick call?`;
      body = `Hi ${name},\n\nWould you be available for a quick 15-minute call this week?`;
      break;
    default:
      subject = `Following up - ${company}`;
      body = `Hi ${name},\n\n${nextStep.action}\n\nBest regards`;
  }

  return { subject, body };
}

async function analyzeWorkspaceDeals(workspaceId: string, brandId?: string): Promise<any> {
  let query = supabase
    .from("deals")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("status", "open");

  if (brandId) {
    query = query.eq("brand_id", brandId);
  }

  const { data: deals } = await query;

  const insights = [];
  let analyzed = 0;

  for (const deal of deals || []) {
    try {
      const insight = await analyzeDeal(deal.id);
      insights.push(insight);
      analyzed++;
    } catch (error) {
      console.error(`Error analyzing deal ${deal.id}:`, error);
    }
  }

  return { analyzed, insights };
}

async function generateDailyReport(workspaceId: string, brandId?: string): Promise<any> {
  console.log(`Generating daily report for workspace ${workspaceId}...`);

  let query = supabase
    .from("deals")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("status", "open");

  if (brandId) {
    query = query.eq("brand_id", brandId);
  }

  const { data: deals } = await query;

  const priorityDeals: any[] = [];
  const stalledDeals: any[] = [];
  const risks: string[] = [];
  const opportunities: string[] = [];

  let totalWinProb = 0;
  let dealCount = 0;

  for (const deal of deals || []) {
    try {
      // Get insights
      const { data: insights } = await supabase
        .from("deal_coach_insights")
        .select("*")
        .eq("deal_id", deal.id)
        .single();

      const winProb = insights?.win_probability || deal.probability || 0;
      totalWinProb += winProb;
      dealCount++;

      // Priority deals (high win probability, action needed)
      if (winProb >= 60 && insights?.recommended_next_action) {
        priorityDeals.push({
          deal_id: deal.id,
          deal_name: deal.deal_name,
          win_probability: winProb,
          action_needed: insights.recommended_next_action,
          stage: deal.stage,
        });
      }

      // Stalled deals
      const daysSinceUpdate = Math.floor(
        (Date.now() - new Date(deal.updated_at).getTime()) / (1000 * 60 * 60 * 24)
      );
      if (daysSinceUpdate > 7 && deal.stage !== 'Won' && deal.stage !== 'Lost') {
        stalledDeals.push({
          deal_id: deal.id,
          deal_name: deal.deal_name,
          stage: deal.stage,
          days_since_activity: daysSinceUpdate,
        });
      }

      // Risks
      if (insights?.risk_tags && insights.risk_tags.length > 0) {
        insights.risk_tags.forEach((tag: string) => {
          if (!risks.includes(tag)) {
            risks.push(tag);
          }
        });
      }
    } catch (error) {
      console.error(`Error processing deal ${deal.id}:`, error);
    }
  }

  // Sort priority deals by win probability
  priorityDeals.sort((a, b) => b.win_probability - a.win_probability);

  // Sort stalled deals by days since activity
  stalledDeals.sort((a, b) => b.days_since_activity - a.days_since_activity);

  const avgWinProbability = dealCount > 0 ? totalWinProb / dealCount : 0;

  const report = {
    workspace_id: workspaceId,
    brand_id: brandId || null,
    report_date: new Date().toISOString().split("T")[0],
    priority_deals: priorityDeals.slice(0, 10), // Top 10
    stalled_deals: stalledDeals.slice(0, 10), // Top 10
    risks: risks.slice(0, 10),
    opportunities: opportunities,
    total_deals: dealCount,
    high_priority_deals: priorityDeals.length,
    stalled_deals_count: stalledDeals.length,
    avg_win_probability: Math.round(avgWinProbability),
  };

  // Save report
  const { error: insertError } = await supabase
    .from("deal_coach_reports")
    .upsert(report, {
      onConflict: "workspace_id,brand_id,report_date",
    });

  if (insertError) {
    console.error("Error saving report:", insertError);
  }

  return report;
}

