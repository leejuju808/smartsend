/**
 * Block 22141 — Lead Source Intelligent Routing
 * Routes leads to the best estimator based on source performance
 */

import { createClient } from "@/lib/supabase/server";

export type RoutingStrategy =
  | "best_performer"
  | "highest_value"
  | "fastest_response"
  | "insurance_specialist"
  | "persistence_strong"
  | "manual";

export interface RoutingResult {
  estimator_id: string | null;
  strategy: RoutingStrategy;
  confidence: number;
  reason: string;
}

/**
 * Get the best estimator for a lead based on its source
 */
export async function routeLeadBySource(
  workspaceId: string,
  leadSource: string,
  estimatedValue?: number
): Promise<RoutingResult> {
  const supabase = createClient();

  // Get routing rule for this source
  const { data: routingRule } = await supabase
    .from("lead_source_routing_rules")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("source_name", leadSource)
    .eq("is_active", true)
    .single();

  // If manual routing is set, use it
  if (routingRule?.routing_strategy === "manual" && routingRule.default_estimator_id) {
    return {
      estimator_id: routingRule.default_estimator_id,
      strategy: "manual",
      confidence: 1.0,
      reason: `Manual routing rule for ${leadSource}`,
    };
  }

  // Get source stats to find best estimator
  const { data: sourceStats } = await supabase
    .from("lead_source_stats")
    .select("best_estimator_id, best_estimator_performance")
    .eq("workspace_id", workspaceId)
    .eq("source_name", leadSource)
    .single();

  // Strategy: best_performer (default)
  if (!routingRule || routingRule.routing_strategy === "best_performer") {
    if (sourceStats?.best_estimator_id) {
      return {
        estimator_id: sourceStats.best_estimator_id,
        strategy: "best_performer",
        confidence: (sourceStats.best_estimator_performance || 0) / 100,
        reason: `Best performer for ${leadSource} (${sourceStats.best_estimator_performance?.toFixed(1)}% close rate)`,
      };
    }
  }

  // Strategy: highest_value
  if (routingRule?.routing_strategy === "highest_value" && estimatedValue) {
    if (estimatedValue >= (routingRule.min_job_value || 0)) {
      // Find estimator with highest average job value for this source
      const { data: estimatorStats } = await supabase
        .from("leads")
        .select("estimator_id, estimated_job_value")
        .eq("workspace_id", workspaceId)
        .eq("lead_source", leadSource)
        .eq("status", "won")
        .not("estimator_id", "is", null)
        .not("estimated_job_value", "is", null)
        .order("estimated_job_value", { ascending: false })
        .limit(1);

      if (estimatorStats?.[0]?.estimator_id) {
        return {
          estimator_id: estimatorStats[0].estimator_id,
          strategy: "highest_value",
          confidence: 0.8,
          reason: `Routes high-value jobs ($${estimatedValue.toLocaleString()}) to top performer`,
        };
      }
    }
  }

  // Strategy: insurance_specialist (for insurance-related sources)
  if (
    routingRule?.routing_strategy === "insurance_specialist" ||
    leadSource.toLowerCase().includes("insurance")
  ) {
    // Find estimator with best performance on insurance leads
    const { data: insuranceStats } = await supabase
      .from("leads")
      .select("estimator_id")
      .eq("workspace_id", workspaceId)
      .ilike("lead_source", "%insurance%")
      .eq("status", "won")
      .not("estimator_id", "is", null);

    if (insuranceStats && insuranceStats.length > 0) {
      // Count wins per estimator
      const estimatorWins = new Map<string, number>();
      insuranceStats.forEach((lead) => {
        if (lead.estimator_id) {
          estimatorWins.set(lead.estimator_id, (estimatorWins.get(lead.estimator_id) || 0) + 1);
        }
      });

      // Find best performer
      let bestEstimator = null;
      let maxWins = 0;
      estimatorWins.forEach((wins, estimatorId) => {
        if (wins > maxWins) {
          maxWins = wins;
          bestEstimator = estimatorId;
        }
      });

      if (bestEstimator) {
        return {
          estimator_id: bestEstimator,
          strategy: "insurance_specialist",
          confidence: 0.85,
          reason: `Insurance specialist (${maxWins} insurance wins)`,
        };
      }
    }
  }

  // Strategy: persistence_strong (for sources with high dropoff rates)
  if (routingRule?.routing_strategy === "persistence_strong") {
    // Find estimator with best follow-up performance
    // This would ideally use a follow-up success metric
    // For now, use estimator with lowest dropoff rate
    const { data: dropoffStats } = await supabase
      .from("leads")
      .select("estimator_id, status, pipeline_stage")
      .eq("workspace_id", workspaceId)
      .eq("lead_source", leadSource)
      .not("estimator_id", "is", null);

    if (dropoffStats && dropoffStats.length > 0) {
      // Calculate dropoff rate per estimator
      const estimatorStats = new Map<
        string,
        { total: number; dropoffs: number }
      >();

      dropoffStats.forEach((lead) => {
        if (!lead.estimator_id) return;
        if (!estimatorStats.has(lead.estimator_id)) {
          estimatorStats.set(lead.estimator_id, { total: 0, dropoffs: 0 });
        }
        const stats = estimatorStats.get(lead.estimator_id)!;
        stats.total++;
        if (
          lead.status === "lost" &&
          ["proposal_sent", "follow_up", "estimate_completed"].includes(
            lead.pipeline_stage || ""
          )
        ) {
          stats.dropoffs++;
        }
      });

      // Find estimator with lowest dropoff rate
      let bestEstimator = null;
      let lowestDropoff = 1.0;
      estimatorStats.forEach((stats, estimatorId) => {
        const dropoffRate = stats.total > 0 ? stats.dropoffs / stats.total : 1.0;
        if (dropoffRate < lowestDropoff) {
          lowestDropoff = dropoffRate;
          bestEstimator = estimatorId;
        }
      });

      if (bestEstimator) {
        return {
          estimator_id: bestEstimator,
          strategy: "persistence_strong",
          confidence: 1.0 - lowestDropoff,
          reason: `Strong persistence (${((1 - lowestDropoff) * 100).toFixed(1)}% retention)`,
        };
      }
    }
  }

  // Fallback: use best performer from source stats
  if (sourceStats?.best_estimator_id) {
    return {
      estimator_id: sourceStats.best_estimator_id,
      strategy: "best_performer",
      confidence: (sourceStats.best_estimator_performance || 0) / 100,
      reason: `Best performer for ${leadSource}`,
    };
  }

  // No routing found
  return {
    estimator_id: null,
    strategy: "best_performer",
    confidence: 0,
    reason: `No routing rule found for ${leadSource}`,
  };
}

/**
 * Auto-assign estimator to a lead based on its source
 */
export async function autoAssignEstimator(
  leadId: string,
  workspaceId: string,
  leadSource: string,
  estimatedValue?: number
): Promise<{ success: boolean; estimatorId: string | null; reason: string }> {
  const supabase = createClient();

  const routing = await routeLeadBySource(workspaceId, leadSource, estimatedValue);

  if (!routing.estimator_id) {
    return {
      success: false,
      estimatorId: null,
      reason: routing.reason,
    };
  }

  // Update lead with assigned estimator
  const { error } = await supabase
    .from("leads")
    .update({ estimator_id: routing.estimator_id })
    .eq("id", leadId);

  if (error) {
    return {
      success: false,
      estimatorId: null,
      reason: `Failed to assign estimator: ${error.message}`,
    };
  }

  return {
    success: true,
    estimatorId: routing.estimator_id,
    reason: routing.reason,
  };
}









































