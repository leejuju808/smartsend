// supabase/functions/lead-source-grade/index.ts
// Block 22141 — SmartSend Roofing Lead Source Performance Engine v1
// Auto-grades every lead source A-F based on the 12-signal system

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const workspace_id = body.workspace_id || null;

    // Step 1: Refresh materialized view
    const { error: refreshError } = await supabase.rpc(
      "refresh_lead_source_performance_view"
    );

    if (refreshError) {
      console.error("Error refreshing materialized view:", refreshError);
      // Continue anyway - view might be fresh enough
    }

    // Step 2: Get all sources from materialized view
    let query = supabase.from("lead_source_performance_view").select("*");
    
    if (workspace_id) {
      query = query.eq("workspace_id", workspace_id);
    }

    const { data: sources, error: sourcesError } = await query;

    if (sourcesError) {
      throw new Error(`Failed to fetch sources: ${sourcesError.message}`);
    }

    if (!sources || sources.length === 0) {
      return new Response(
        JSON.stringify({ 
        success: true, 
        message: "No sources found",
        processed: 0 
      }), {
        status: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    const results = [];

    // Step 3: Grade each source
    for (const src of sources) {
      // Calculate composite score based on 12-signal system
      let score = 0;

      // Core Revenue Metrics (40% weight)
      score += (src.close_rate || 0) * 0.20; // Close rate: 20%
      score += Math.min((src.avg_job_size || 0) / 200, 1) * 100 * 0.10; // Avg job size: 10% (normalize: $20k = 100%)
      score += Math.min((src.revenue_won || 0) / 100000, 1) * 100 * 0.10; // Total revenue: 10% (normalize: $100k = 100%)

      // Intelligence Metrics (35% weight)
      score += (src.avg_health || 0) * 0.15; // Avg health: 15%
      score += (src.avg_momentum || 0) * 0.10; // Avg momentum: 10%
      score += (src.avg_experience || 0) * 0.10; // Avg experience: 10%

      // Risk Penalty (10% weight)
      score -= (src.avg_risk || 0) * 0.10; // Risk penalty: -10%

      // Behavior Penalties (15% weight)
      score -= (src.ghosting_rate || 0) * 0.10; // Ghosting penalty: -10%
      score -= (src.dropoff_rate || 0) * 0.05; // Dropoff penalty: -5%

      // Volume bonus (small boost for sources with enough data)
      if ((src.total_leads || 0) >= 10) {
        score += 5; // Small bonus for having enough data
      }

      // Clamp score to 0-100
      score = Math.max(0, Math.min(100, score));

      // Determine grade
      let grade = "C";
      if (score >= 85) grade = "A+";
      else if (score >= 75) grade = "A";
      else if (score >= 60) grade = "B";
      else if (score >= 40) grade = "C";
      else if (score >= 25) grade = "D";
      else grade = "F";

      // Step 4: Calculate best estimator for this source
      const { data: estimatorData } = await supabase
        .from("leads")
        .select("estimator_id")
        .eq("workspace_id", src.workspace_id)
        .eq("lead_source", src.source_name)
        .not("estimator_id", "is", null);

      let bestEstimatorId = null;
      let bestEstimatorPerformance = 0;

      if (estimatorData && estimatorData.length > 0) {
        // Group by estimator and calculate close rate
        const estimatorMap = new Map<string, { wins: number; total: number }>();
        
        for (const lead of estimatorData) {
          const estimatorId = lead.estimator_id;
          if (!estimatorId) continue;
          
          if (!estimatorMap.has(estimatorId)) {
            estimatorMap.set(estimatorId, { wins: 0, total: 0 });
          }
          
          const stats = estimatorMap.get(estimatorId)!;
          stats.total++;
        }

        // Get win counts for each estimator
        const { data: winsData } = await supabase
          .from("leads")
          .select("estimator_id")
          .eq("workspace_id", src.workspace_id)
          .eq("lead_source", src.source_name)
          .eq("status", "won")
          .not("estimator_id", "is", null);

        if (winsData) {
          for (const win of winsData) {
            const estimatorId = win.estimator_id;
            if (estimatorId && estimatorMap.has(estimatorId)) {
              estimatorMap.get(estimatorId)!.wins++;
            }
          }
        }

        // Find best performer
        for (const [estimatorId, stats] of estimatorMap.entries()) {
          const performance = stats.total > 0 ? (stats.wins / stats.total) * 100 : 0;
          if (performance > bestEstimatorPerformance) {
            bestEstimatorPerformance = performance;
            bestEstimatorId = estimatorId;
          }
        }
      }

      // Step 5: Upsert into lead_source_stats
      const { error: upsertError } = await supabase
        .from("lead_source_stats")
        .upsert(
          {
            workspace_id: src.workspace_id,
            source_name: src.source_name,
            total_leads: src.total_leads || 0,
            leads_won: src.leads_won || 0,
            revenue_won: src.revenue_won || 0,
            avg_job_size: src.avg_job_size || 0,
            close_rate: src.close_rate || 0,
            avg_health: src.avg_health || 0,
            avg_momentum: src.avg_momentum || 0,
            avg_experience: src.avg_experience || 0,
            avg_risk: src.avg_risk || 0,
            ghosting_rate: src.ghosting_rate || 0,
            dropoff_rate: src.dropoff_rate || 0,
            avg_days_to_close: src.avg_days_to_close || 0,
            best_estimator_id: bestEstimatorId,
            best_estimator_performance: bestEstimatorPerformance,
            grade,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: "workspace_id,source_name",
          }
        );

      if (upsertError) {
        console.error(`Error upserting stats for ${src.source_name}:`, upsertError);
        continue;
      }

      // Step 6: Generate recommendations
      await generateRecommendations(src, grade, score);

      results.push({
        workspace_id: src.workspace_id,
        source_name: src.source_name,
        grade,
        score: Math.round(score),
        close_rate: src.close_rate,
        revenue_won: src.revenue_won,
      });
    }

    // Step 7: Calculate estimator performance by source
    const { error: estimatorError } = await supabase.rpc(
      "calculate_estimator_source_performance"
    );

    if (estimatorError) {
      console.error("Error calculating estimator performance:", estimatorError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: results.length,
        results,
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
    console.error("lead-source-grade error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal server error" }),
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

// Generate AI recommendations for a source
async function generateRecommendations(
  source: any,
  grade: string,
  score: number
): Promise<void> {
  const recommendations = [];

  // High-performing sources (A/A+)
  if (grade === "A" || grade === "A+") {
    if (source.close_rate >= 30 && source.avg_job_size >= 15000) {
      recommendations.push({
        recommendation_type: "increase_budget",
        recommendation_text: `${source.source_name} produces high-value jobs ($${Math.round(source.avg_job_size).toLocaleString()} avg) with a ${source.close_rate.toFixed(1)}% close rate. Consider increasing budget allocation.`,
        priority: "high",
        supporting_data: {
          close_rate: source.close_rate,
          avg_job_size: source.avg_job_size,
          revenue_won: source.revenue_won,
        },
      });
    }

    if (source.avg_days_to_close <= 5 && source.avg_days_to_close > 0) {
      recommendations.push({
        recommendation_type: "change_routing",
        recommendation_text: `${source.source_name} closes fast (${source.avg_days_to_close.toFixed(1)} days avg). Route these leads to your fastest-responding estimator to maximize conversion.`,
        priority: "medium",
        supporting_data: {
          avg_days_to_close: source.avg_days_to_close,
        },
      });
    }
  }

  // Low-performing sources (D/F)
  if (grade === "D" || grade === "F") {
    if (source.close_rate < 10) {
      recommendations.push({
        recommendation_type: "stop_buying",
        recommendation_text: `${source.source_name} has a ${source.close_rate.toFixed(1)}% close rate and ${source.ghosting_rate.toFixed(1)}% ghosting rate. Consider discontinuing or significantly reducing spend.`,
        priority: "critical",
        supporting_data: {
          close_rate: source.close_rate,
          ghosting_rate: source.ghosting_rate,
          dropoff_rate: source.dropoff_rate,
        },
      });
    }

    if (source.dropoff_rate >= 30) {
      recommendations.push({
        recommendation_type: "change_routing",
        recommendation_text: `${source.source_name} has a ${source.dropoff_rate.toFixed(1)}% dropoff rate in proposal stage. Route to your persistence-strong estimator who excels at follow-ups.`,
        priority: "high",
        supporting_data: {
          dropoff_rate: source.dropoff_rate,
        },
      });
    }

    if (source.avg_risk >= 50) {
      recommendations.push({
        recommendation_type: "improve_quality",
        recommendation_text: `${source.source_name} shows high risk scores (${source.avg_risk.toFixed(1)}). These leads may need more careful handling or qualification.`,
        priority: "medium",
        supporting_data: {
          avg_risk: source.avg_risk,
        },
      });
    }
  }

  // Medium-performing sources (B/C)
  if (grade === "B" || grade === "C") {
    if (source.ghosting_rate >= 40) {
      recommendations.push({
        recommendation_type: "optimize_followup",
        recommendation_text: `${source.source_name} has a ${source.ghosting_rate.toFixed(1)}% ghosting rate. Implement faster follow-up sequences to reduce ghosting.`,
        priority: "medium",
        supporting_data: {
          ghosting_rate: source.ghosting_rate,
        },
      });
    }

    if (source.avg_experience < 50) {
      recommendations.push({
        recommendation_type: "improve_quality",
        recommendation_text: `${source.source_name} shows low homeowner experience scores (${source.avg_experience.toFixed(1)}). Review messaging and process to improve homeowner satisfaction.`,
        priority: "low",
        supporting_data: {
          avg_experience: source.avg_experience,
        },
      });
    }
  }

  // Upsert recommendations
  for (const rec of recommendations) {
    await supabase
      .from("lead_source_recommendations")
      .upsert(
        {
          workspace_id: source.workspace_id,
          source_name: source.source_name,
          ...rec,
          status: "active",
        },
        {
          onConflict: "workspace_id,source_name,recommendation_type,status",
        }
      )
      .catch((err) => {
        console.error("Error upserting recommendation:", err);
      });
  }
}









































