// Block 22158 — SmartSend Roofing "Estimator Coaching Engine v1"
// Edge Function: Generate AI-powered coaching reports (daily & weekly)
// Runs nightly for daily reports, weekly every Monday at 5am for weekly reports
//
// This engine analyzes estimator behavior, compares it to top-performing patterns,
// and provides WEEKLY & DAILY coaching notes to improve close rates.
//
// This engine becomes the sales manager in a box.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { OpenAI } from "https://esm.sh/openai@4.0.0";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY")! });

interface CoachingInput {
  estimator_id?: string; // Optional: if not provided, generates for all estimators
  workspace_id: string;
  report_type: "daily" | "weekly";
  period_start?: string; // Optional: ISO date string, defaults to calculated period
  period_end?: string; // Optional: ISO date string, defaults to calculated period
}

interface CoachingOutput {
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
  top_priority: string;
  patterns: {
    hurting: string[];
    improving: string[];
  };
  scripts: string[];
}

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
    const input: CoachingInput = await req.json();

    if (!input.workspace_id || !input.report_type) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: workspace_id, report_type" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Calculate period dates if not provided
    let period_start: string;
    let period_end: string;

    if (input.period_start && input.period_end) {
      period_start = input.period_start;
      period_end = input.period_end;
    } else {
      const today = new Date();
      if (input.report_type === "daily") {
        period_start = today.toISOString().split("T")[0];
        period_end = period_start;
      } else {
        // Weekly: get Monday-Sunday of current week
        const dayOfWeek = today.getDay();
        const monday = new Date(today);
        monday.setDate(today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1));
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        period_start = monday.toISOString().split("T")[0];
        period_end = sunday.toISOString().split("T")[0];
      }
    }

    console.log(`[Estimator Coaching] Generating ${input.report_type} report for workspace ${input.workspace_id}, period ${period_start} to ${period_end}`);

    // Get estimators to process
    let estimatorIds: string[] = [];

    if (input.estimator_id) {
      estimatorIds = [input.estimator_id];
    } else {
      // Get all estimators in workspace
      const { data: members, error: membersError } = await supabase
        .from("workspace_members")
        .select("user_id")
        .eq("workspace_id", input.workspace_id);

      if (membersError) {
        console.error("Error fetching workspace members:", membersError);
        throw membersError;
      }

      estimatorIds = (members || []).map((m) => m.user_id).filter(Boolean) as string[];

      // Also check contractor_roles for sales reps
      const { data: roles, error: rolesError } = await supabase
        .from("contractor_roles")
        .select("user_id")
        .eq("workspace_id", input.workspace_id)
        .in("role_type", ["sales_rep", "owner_operator", "storm_rep"]);

      if (!rolesError && roles) {
        const roleIds = roles.map((r) => r.user_id).filter(Boolean) as string[];
        estimatorIds = [...new Set([...estimatorIds, ...roleIds])];
      }
    }

    if (estimatorIds.length === 0) {
      return new Response(
        JSON.stringify({ error: "No estimators found for this workspace" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Process each estimator
    const results = [];

    for (const estimatorId of estimatorIds) {
      try {
        const coachingReport = await generateCoachingReport(
          estimatorId,
          input.workspace_id,
          input.report_type,
          period_start,
          period_end
        );

        results.push({
          estimator_id: estimatorId,
          ...coachingReport,
        });
      } catch (error: any) {
        console.error(`Error generating coaching for estimator ${estimatorId}:`, error);
        results.push({
          estimator_id: estimatorId,
          error: error.message,
        });
      }
    }

    return new Response(
      JSON.stringify({ results }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[Estimator Coaching] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

async function generateCoachingReport(
  estimatorId: string,
  workspaceId: string,
  reportType: "daily" | "weekly",
  periodStart: string,
  periodEnd: string
): Promise<any> {
  // Pull estimator intelligence from unified view
  const { data: estimator, error: viewError } = await supabase
    .from("estimator_full_intelligence_view")
    .select("*")
    .eq("estimator_id", estimatorId)
    .eq("workspace_id", workspaceId)
    .single();

  if (viewError || !estimator) {
    console.error("Error fetching estimator intelligence:", viewError);
    throw new Error(`Failed to fetch estimator intelligence: ${viewError?.message}`);
  }

  // Get peer comparison data (for context)
  const { data: peers, error: peersError } = await supabase
    .from("estimator_full_intelligence_view")
    .select("performance_score, close_rate_30d, avg_speed_to_lead_seconds")
    .eq("workspace_id", workspaceId)
    .neq("estimator_id", estimatorId)
    .limit(10);

  const peerAvgPerformance = peers && peers.length > 0
    ? peers.reduce((sum, p) => sum + (p.performance_score || 0), 0) / peers.length
    : null;

  const peerAvgCloseRate = peers && peers.length > 0
    ? peers.reduce((sum, p) => sum + (p.close_rate_30d || 0), 0) / peers.length
    : null;

  // Build comprehensive prompt for AI
  const prompt = buildCoachingPrompt(estimator, reportType, peerAvgPerformance, peerAvgCloseRate);

  // Call OpenAI
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `You are SmartSend AI, an expert sales coach for roofing estimators. Your job is to analyze performance data and generate actionable, specific coaching feedback that helps estimators improve their close rates and revenue generation. Be direct, specific, and data-driven. Focus on behaviors that directly impact revenue.`,
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0.7,
  });

  const rawResult = completion.choices[0].message.content;
  if (!rawResult) {
    throw new Error("No response from OpenAI");
  }

  let parsed: CoachingOutput;
  try {
    parsed = JSON.parse(rawResult);
  } catch (e) {
    console.error("Failed to parse OpenAI response:", rawResult);
    throw new Error(`Invalid JSON response from AI: ${e}`);
  }

  // Validate structure
  if (!parsed.strengths || !parsed.weaknesses || !parsed.recommendations) {
    throw new Error("AI response missing required fields");
  }

  // Prepare insights object
  const insights = {
    performance_summary: `Performance Score: ${estimator.performance_score || "N/A"}/100. Close Rate: ${(estimator.close_rate_30d || 0).toFixed(1)}%. Active Jobs: ${estimator.active_jobs || 0}.`,
    comparison: peerAvgPerformance
      ? `Your performance score is ${(estimator.performance_score || 0) > peerAvgPerformance ? "above" : "below"} the team average of ${peerAvgPerformance.toFixed(0)}.`
      : null,
  };

  // Insert/upsert coaching report
  // Database has both JSONB fields (new) and text fields (legacy)
  // We populate both for backward compatibility
  const coachingReport = {
    estimator_id: estimatorId,
    workspace_id: workspaceId,
    report_type: reportType,
    week_start: periodStart,
    week_end: periodEnd,
    // New JSONB fields
    insights: insights,
    recommendations: parsed.recommendations,
    strengths_data: parsed.strengths, // JSONB array
    weaknesses_data: parsed.weaknesses, // JSONB array
    top_priority: parsed.top_priority || null,
    scripts: parsed.scripts || [],
    patterns: parsed.patterns || { hurting: [], improving: [] },
    // Legacy text fields (for backward compatibility with existing components)
    summary: insights.performance_summary,
    strengths: parsed.strengths.join(". "), // Text field (legacy)
    weaknesses: parsed.weaknesses.join(". "), // Text field (legacy)
    action_items: parsed.recommendations.join("\n"),
    opportunity: parsed.top_priority || null,
  };

  // Upsert using the unique constraint on (estimator_id, workspace_id, report_type, week_start, week_end)
  const { data: inserted, error: insertError } = await supabase
    .from("estimator_coaching_reports")
    .upsert(coachingReport, {
      onConflict: "estimator_id,workspace_id,report_type,week_start,week_end",
    })
    .select()
    .single();

  if (insertError) {
    console.error("Error inserting coaching report:", insertError);
    throw insertError;
  }

  return inserted;
}

function buildCoachingPrompt(
  estimator: any,
  reportType: "daily" | "weekly",
  peerAvgPerformance: number | null,
  peerAvgCloseRate: number | null
): string {
  const periodLabel = reportType === "daily" ? "today" : "this week";

  return `Generate a ${reportType.toUpperCase()} coaching report for a roofing estimator.

ESTIMATOR PERFORMANCE DATA:
${JSON.stringify(estimator, null, 2)}

${peerAvgPerformance ? `TEAM COMPARISON: Average team performance score: ${peerAvgPerformance.toFixed(0)}/100. Average team close rate: ${peerAvgCloseRate?.toFixed(1)}%.` : ""}

ANALYZE THIS DATA AND GENERATE:

1. **Strengths** (array of strings): What they're doing well ${periodLabel}. Be specific and data-driven.
   Example: "Fast response time — averaging 4 minutes to first response"
   Example: "Strong close rate on referral leads — 45% vs team average of 28%"

2. **Weaknesses** (array of strings): Critical weaknesses costing revenue. Be direct and specific.
   Example: "You lose 72% of jobs when proposal delivery exceeds 24 hours"
   Example: "Inconsistent follow-ups — missed 4 follow-ups this week, likely costing $14,000 in job value"
   Example: "Struggles with frustrated homeowners — 3 out of 4 negative tone leads resulted in losses"

3. **Recommendations** (array of strings): Specific actionable recommendations for improvement.
   Example: "Deliver proposals within 12 hours. This is your #1 revenue opportunity."
   Example: "Use AI soft re-engagement script more often for ghosting jobs"
   Example: "Ask timeline earlier in the conversation — you close 30% more when timeline is discussed in first 3 messages"

4. **Top Priority** (string): Single most important improvement item.
   Example: "Deliver proposals within 12 hours. This is your #1 revenue opportunity."

5. **Patterns** (object with "hurting" and "improving" arrays):
   - hurting: Patterns that are hurting performance
   - improving: Patterns that are improving performance
   Example hurting: "You always lose when proposal delivery exceeds 24 hours"
   Example improving: "Homeowners with price-sensitive intent respond better to your longer explanations"

6. **Scripts** (array of strings): Suggested scripts/templates for the estimator to use.
   Example: "Timeline clarification script"
   Example: "Frustration reset script"
   Example: "Soft re-engagement script for ghosting jobs"

FORMAT AS JSON:
{
  "strengths": ["strength 1", "strength 2", ...],
  "weaknesses": ["weakness 1", "weakness 2", ...],
  "recommendations": ["recommendation 1", "recommendation 2", ...],
  "top_priority": "single top priority improvement",
  "patterns": {
    "hurting": ["pattern 1", "pattern 2", ...],
    "improving": ["pattern 1", "pattern 2", ...]
  },
  "scripts": ["script 1", "script 2", ...]
}

Be specific, actionable, and revenue-focused. Focus on behaviors that directly impact close rates and revenue generation.`;
}

