// Block 22041 — SmartSend Roofing "Daily Company Pulse" v1
// Edge Function — Get Daily Pulse Data
// Aggregates all critical business metrics into one morning report

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";
import OpenAI from "npm:openai@4";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false },
});

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  try {
    const { workspace_id } = await req.json();

    if (!workspace_id) {
      return new Response(
        JSON.stringify({ error: "Missing required parameter: workspace_id" }),
        { 
          status: 400, 
          headers: { 
            "Content-Type": "application/json",
            'Access-Control-Allow-Origin': '*',
          } 
        }
      );
    }

    // ============================================================================
    // SECTION 1 — MAIN PULSE METRICS FROM VIEW
    // ============================================================================

    const { data: pulse, error: pulseError } = await supabase
      .from("daily_pulse_view")
      .select("*")
      .eq("workspace_id", workspace_id)
      .single();

    if (pulseError) {
      console.error("Error fetching pulse view:", pulseError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch pulse data" }),
        { 
          status: 500, 
          headers: { 
            "Content-Type": "application/json",
            'Access-Control-Allow-Origin': '*',
          } 
        }
      );
    }

    // Calculate company health score
    const { data: healthScoreData, error: healthError } = await supabase
      .rpc("calculate_company_health_score", { p_workspace_id: workspace_id });

    const company_health_score = healthError ? 50 : (typeof healthScoreData === 'number' ? healthScoreData : 50);

    // Update workspace_stats with calculated health score
    await supabase
      .from("workspace_stats")
      .upsert(
        {
          workspace_id,
          company_health_score,
          calculated_at: new Date().toISOString(),
        },
        {
          onConflict: "workspace_id",
        }
      );

    // ============================================================================
    // SECTION 2 — JOBS REQUIRING ATTENTION TODAY
    // ============================================================================

    const { data: atRiskJobs, error: atRiskError } = await supabase
      .from("leads")
      .select("id, name, email, job_health_score, momentum_score, risk_category, estimated_job_value, status")
      .eq("workspace_id", workspace_id)
      .lt("job_health_score", 50)
      .not("status", "in", ["won", "lost"])
      .order("job_health_score", { ascending: true })
      .limit(20);

    // ============================================================================
    // SECTION 3 — PIPELINE MOVEMENTS (LAST 24 HOURS)
    // ============================================================================

    const twentyFourHoursAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

    // Get pipeline events by joining through leads
    const { data: leadsForEvents } = await supabase
      .from("leads")
      .select("id")
      .eq("workspace_id", workspace_id);

    const leadIds = leadsForEvents?.map(l => l.id) || [];
    let pipelineEvents: any[] = [];

    if (leadIds.length > 0) {
      const { data: events } = await supabase
        .from("job_timelines")
        .select("id, lead_id, event_type, created_at, event_data")
        .in("lead_id", leadIds)
        .gte("created_at", twentyFourHoursAgo)
        .order("created_at", { ascending: false })
        .limit(50);

      // Enrich with lead info
      if (events && events.length > 0) {
        const eventLeadIds = [...new Set(events.map(e => e.lead_id))];
        const { data: leadInfo } = await supabase
          .from("leads")
          .select("id, name, email")
          .in("id", eventLeadIds);

        pipelineEvents = events.map(event => {
          const lead = leadInfo?.find(l => l.id === event.lead_id);
          return {
            ...event,
            lead_name: lead?.name || lead?.homeowner_name || lead?.email || "Unknown",
          };
        });
      }
    }

    // ============================================================================
    // SECTION 4 — ESTIMATOR PERFORMANCE SNAPSHOT
    // ============================================================================

    // Get estimator performance with profile info
    const { data: estimatorPerformanceRaw, error: estimatorError } = await supabase
      .from("estimator_performance")
      .select(`
        estimator_id,
        performance_score,
        speed_score,
        followup_score,
        proposal_score,
        close_rate_score,
        tone_score,
        ai_alignment_score,
        calculated_at
      `)
      .eq("workspace_id", workspace_id)
      .order("performance_score", { ascending: false })
      .limit(10);

    // Get profile info for estimators
    const estimatorIds = estimatorPerformanceRaw?.map(ep => ep.estimator_id) || [];
    let estimatorPerformance: any[] = [];

    if (estimatorIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email, workspace_id")
        .in("id", estimatorIds)
        .eq("workspace_id", workspace_id);

      estimatorPerformance = (estimatorPerformanceRaw || []).map(ep => {
        const profile = profiles?.find(p => p.id === ep.estimator_id);
        return {
          ...ep,
          name: profile?.full_name || profile?.email || "Unknown",
        };
      });
    }

    // ============================================================================
    // SECTION 5 — AI SUMMARY GENERATION
    // ============================================================================

    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    let ai_summary = "";

    if (openaiApiKey) {
      try {
        const client = new OpenAI({ apiKey: openaiApiKey });

        const prompt = `You are SmartSend AI. Summarize the roofing company's last 24 hours.

Data:
- Company Health Score: ${company_health_score}/100
- Average Job Health: ${pulse?.avg_job_health?.toFixed(1) || 0}/100
- Win Rate (7 days): ${pulse?.win_rate_7d?.toFixed(1) || 0}%
- Revenue Today: $${(pulse?.revenue_today || 0).toLocaleString()}
- Revenue Last 7 Days: $${(pulse?.revenue_last_7_days || 0).toLocaleString()}
- Healthy Jobs: ${pulse?.healthy_jobs || 0}
- Watchlist Jobs: ${pulse?.watchlist_jobs || 0}
- At-Risk Jobs: ${pulse?.at_risk_jobs || 0}
- Pipeline Events (24h): ${pulse?.pipeline_events_24h || 0}
- At-Risk Jobs Count: ${atRiskJobs?.length || 0}
- Estimator Count: ${pulse?.estimator_count || 0}

Write a short summary (3-4 sentences) with:
- 1 big win (what's going right)
- 1 concern (what needs attention)
- 1 recommended action (what to do today)

Use roofing language. Be direct and actionable. Format as:
🔥 Big Win: [win]
⚠️ Concern: [concern]
📌 Action: [action]`;

        const completion = await client.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 300,
          temperature: 0.7,
        });

        ai_summary = completion.choices[0]?.message?.content || "";
      } catch (aiError) {
        console.error("Error generating AI summary:", aiError);
        ai_summary = "AI summary unavailable. Check your metrics manually.";
      }
    } else {
      ai_summary = "AI summary unavailable. Check your metrics manually.";
    }

    // ============================================================================
    // RETURN COMPLETE DATA STRUCTURE
    // ============================================================================

    return new Response(
      JSON.stringify({
        pulse: {
          ...pulse,
          company_health_score,
        },
        atRiskJobs: atRiskJobs || [],
        pipelineEvents: pipelineEvents || [],
        estimatorPerformance: estimatorPerformance || [],
        ai_summary,
      }),
      { 
        status: 200, 
        headers: { 
          "Content-Type": "application/json",
          'Access-Control-Allow-Origin': '*',
        } 
      }
    );
  } catch (error: any) {
    console.error("get-daily-pulse error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { 
        status: 500, 
        headers: { 
          "Content-Type": "application/json",
          'Access-Control-Allow-Origin': '*',
        } 
      }
    );
  }
});

