// Block 80000 — SmartSend Roofing
// "Job Value Predictor + Profit Probability AI" v1
// Prediction Engine Edge Function

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

interface LeadData {
  id: string;
  workspace_id: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  status?: string;
  custom?: Record<string, any>;
  created_at?: string;
}

interface PredictionResult {
  predicted_job_value: number;
  predicted_job_value_min: number;
  predicted_job_value_max: number;
  close_probability: number;
  profit_score: number;
  recommended_priority: "High" | "Medium" | "Low";
  reasoning: string;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const { lead_id, workspace_id } = await req.json();

    if (!lead_id) {
      return new Response(
        JSON.stringify({ error: "Missing required field: lead_id" }),
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
      return new Response(
        JSON.stringify({ error: "Lead not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    const effectiveWorkspaceId = workspace_id || lead.workspace_id;
    if (!effectiveWorkspaceId) {
      return new Response(
        JSON.stringify({ error: "Workspace ID required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Run prediction
    const prediction = await calculatePrediction(lead, effectiveWorkspaceId);

    // Save prediction to database
    const { data: savedPrediction, error: saveError } = await supabase
      .from("lead_value_predictions")
      .upsert({
        lead_id: lead_id,
        workspace_id: effectiveWorkspaceId,
        predicted_job_value: prediction.predicted_job_value,
        predicted_job_value_min: prediction.predicted_job_value_min,
        predicted_job_value_max: prediction.predicted_job_value_max,
        close_probability: prediction.close_probability,
        profit_score: prediction.profit_score,
        recommended_priority: prediction.recommended_priority,
        reasoning: prediction.reasoning,
        prediction_model_version: "v1",
        updated_at: new Date().toISOString(),
      }, {
        onConflict: "lead_id",
        ignoreDuplicates: false,
      })
      .select()
      .single();

    if (saveError) {
      console.error("Error saving prediction:", saveError);
      // Still return the prediction even if save fails
    }

    return new Response(
      JSON.stringify({
        success: true,
        prediction: savedPrediction || prediction,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in predict-lead-value:", error);
    return new Response(
      JSON.stringify({ error: error.message || String(error) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

/**
 * Main prediction calculation logic
 */
async function calculatePrediction(
  lead: LeadData,
  workspaceId: string
): Promise<PredictionResult> {
  // Extract ZIP code from lead data (could be in custom field, address, etc.)
  const zipcode = extractZipcode(lead);
  
  // Gather training data context
  const zipcodeStats = await getZipcodeStats(workspaceId, zipcode);
  const sourceStats = await getSourceStats(workspaceId, lead);
  const personaStats = await getPersonaStats(workspaceId, lead);
  
  // Calculate base job value prediction
  const baseJobValue = calculateBaseJobValue(zipcodeStats, sourceStats);
  const jobValueRange = calculateJobValueRange(baseJobValue);
  
  // Calculate close probability
  const closeProbability = calculateCloseProbability(
    zipcodeStats,
    sourceStats,
    personaStats,
    lead
  );
  
  // Calculate profit score (master metric)
  const profitScore = calculateProfitScore(
    baseJobValue,
    closeProbability,
    lead
  );
  
  // Determine priority
  const priority = determinePriority(profitScore, closeProbability, baseJobValue);
  
  // Generate reasoning
  const reasoning = generateReasoning(
    zipcodeStats,
    sourceStats,
    priority,
    profitScore,
    baseJobValue,
    closeProbability
  );

  return {
    predicted_job_value: baseJobValue,
    predicted_job_value_min: jobValueRange.min,
    predicted_job_value_max: jobValueRange.max,
    close_probability: closeProbability,
    profit_score: profitScore,
    recommended_priority: priority,
    reasoning: reasoning,
  };
}

/**
 * Extract ZIP code from lead data
 */
function extractZipcode(lead: LeadData): string | null {
  // Check custom field first
  if (lead.custom?.zipcode) return lead.custom.zipcode;
  if (lead.custom?.zip) return lead.custom.zip;
  if (lead.custom?.address) {
    // Try to extract ZIP from address
    const zipMatch = lead.custom.address.match(/\b\d{5}(-\d{4})?\b/);
    if (zipMatch) return zipMatch[0];
  }
  // Could also check other fields or enrichment data
  return null;
}

/**
 * Get ZIP code statistics from training data
 */
async function getZipcodeStats(
  workspaceId: string,
  zipcode: string | null
): Promise<any> {
  if (!zipcode) {
    return {
      total_jobs: 0,
      closed_jobs: 0,
      avg_job_value: 0,
      close_rate: 0.5, // Default assumption
    };
  }

  const { data, error } = await supabase.rpc("get_zipcode_stats", {
    p_workspace_id: workspaceId,
    p_zipcode: zipcode,
  });

  if (error || !data || data.length === 0) {
    // Return defaults if no data
    return {
      total_jobs: 0,
      closed_jobs: 0,
      avg_job_value: 12000, // Industry average fallback
      close_rate: 0.5,
    };
  }

  return data[0];
}

/**
 * Get source statistics (cold email, referral, etc.)
 */
async function getSourceStats(
  workspaceId: string,
  lead: LeadData
): Promise<any> {
  const source = lead.custom?.source || "cold_email";
  
  const { data, error } = await supabase
    .from("job_history_training")
    .select("job_value, closed")
    .eq("workspace_id", workspaceId)
    .eq("source", source);

  if (error || !data || data.length === 0) {
    // Default source stats
    const defaults: Record<string, any> = {
      cold_email: { avg_value: 10000, close_rate: 0.4 },
      referral: { avg_value: 15000, close_rate: 0.7 },
      repeat: { avg_value: 18000, close_rate: 0.8 },
      storm: { avg_value: 20000, close_rate: 0.6 },
    };
    return defaults[source] || defaults.cold_email;
  }

  const closed = data.filter((j) => j.closed);
  const avgValue = closed.length > 0
    ? closed.reduce((sum, j) => sum + Number(j.job_value || 0), 0) / closed.length
    : 10000;
  const closeRate = data.length > 0 ? closed.length / data.length : 0.4;

  return { avg_value: avgValue, close_rate: closeRate };
}

/**
 * Get persona performance statistics
 */
async function getPersonaStats(
  workspaceId: string,
  lead: LeadData
): Promise<any> {
  const persona = lead.custom?.persona_used || null;
  
  if (!persona) {
    return { avg_close_rate: 0.5 };
  }

  const { data, error } = await supabase
    .from("job_history_training")
    .select("closed")
    .eq("workspace_id", workspaceId)
    .eq("persona_used", persona);

  if (error || !data || data.length === 0) {
    return { avg_close_rate: 0.5 };
  }

  const closeRate = data.filter((j) => j.closed).length / data.length;
  return { avg_close_rate: closeRate };
}

/**
 * Calculate base job value prediction
 */
function calculateBaseJobValue(
  zipcodeStats: any,
  sourceStats: any
): number {
  // Weighted average: 60% ZIP code average, 40% source average
  const zipWeight = zipcodeStats.total_jobs > 5 ? 0.6 : 0.4;
  const sourceWeight = 1 - zipWeight;
  
  const zipValue = zipcodeStats.avg_job_value || 12000;
  const sourceValue = sourceStats.avg_value || 12000;
  
  return Math.round(zipValue * zipWeight + sourceValue * sourceWeight);
}

/**
 * Calculate job value range (±20% by default)
 */
function calculateJobValueRange(baseValue: number): { min: number; max: number } {
  const variance = baseValue * 0.2;
  return {
    min: Math.round(baseValue - variance),
    max: Math.round(baseValue + variance),
  };
}

/**
 * Calculate close probability (0-1)
 */
function calculateCloseProbability(
  zipcodeStats: any,
  sourceStats: any,
  personaStats: any,
  lead: LeadData
): number {
  // Base probability from ZIP code close rate
  let probability = zipcodeStats.close_rate || 0.5;
  
  // Adjust based on source
  const sourceCloseRate = sourceStats.close_rate || 0.5;
  probability = (probability * 0.6) + (sourceCloseRate * 0.4);
  
  // Adjust based on persona performance
  const personaCloseRate = personaStats.avg_close_rate || 0.5;
  probability = (probability * 0.7) + (personaCloseRate * 0.3);
  
  // Adjust based on lead status
  if (lead.status === "replied") {
    probability *= 1.2; // 20% boost for replied leads
  }
  if (lead.status === "in_progress") {
    probability *= 1.4; // 40% boost for in-progress leads
  }
  
  // Clamp between 0.1 and 0.95
  probability = Math.max(0.1, Math.min(0.95, probability));
  
  return Math.round(probability * 100) / 100; // Round to 2 decimals
}

/**
 * Calculate Profit Score (0-100) - THE MASTER METRIC
 * Profit Score = (Job Value × Close Probability) - Difficulty Penalty
 */
function calculateProfitScore(
  jobValue: number,
  closeProbability: number,
  lead: LeadData
): number {
  // Base score: normalized job value × close probability
  // Normalize job value to 0-100 scale (assuming max $50k job = 100)
  const normalizedValue = Math.min(100, (jobValue / 50000) * 100);
  const baseScore = (normalizedValue * closeProbability);
  
  // Difficulty penalty (could factor in drive time, roof complexity, etc.)
  // For now, simple penalty based on status
  let difficultyPenalty = 0;
  if (lead.status === "new") {
    difficultyPenalty = 5; // New leads need more work
  }
  
  const finalScore = baseScore - difficultyPenalty;
  
  // Clamp to 0-100
  return Math.max(0, Math.min(100, Math.round(finalScore)));
}

/**
 * Determine priority level
 */
function determinePriority(
  profitScore: number,
  closeProbability: number,
  jobValue: number
): "High" | "Medium" | "Low" {
  if (profitScore >= 70 || (closeProbability >= 0.7 && jobValue >= 15000)) {
    return "High";
  }
  if (profitScore >= 40 || (closeProbability >= 0.5 && jobValue >= 10000)) {
    return "Medium";
  }
  return "Low";
}

/**
 * Generate human-readable reasoning
 */
function generateReasoning(
  zipcodeStats: any,
  sourceStats: any,
  priority: string,
  profitScore: number,
  jobValue: number,
  closeProbability: number
): string {
  const reasons: string[] = [];
  
  if (zipcodeStats.total_jobs > 0) {
    if (zipcodeStats.close_rate > 0.6) {
      reasons.push(`ZIP code has ${Math.round(zipcodeStats.close_rate * 100)}% close rate (${zipcodeStats.closed_jobs}/${zipcodeStats.total_jobs} jobs closed)`);
    }
    if (zipcodeStats.avg_job_value > 15000) {
      reasons.push(`ZIP code averages $${Math.round(zipcodeStats.avg_job_value).toLocaleString()} per job`);
    }
  }
  
  if (closeProbability >= 0.7) {
    reasons.push(`High close probability (${Math.round(closeProbability * 100)}%) based on historical data`);
  }
  
  if (jobValue >= 15000) {
    reasons.push(`Estimated job value: $${jobValue.toLocaleString()} (high-value opportunity)`);
  }
  
  if (profitScore >= 70) {
    reasons.push(`Profit Score: ${Math.round(profitScore)}/100 (excellent opportunity)`);
  } else if (profitScore < 40) {
    reasons.push(`Profit Score: ${Math.round(profitScore)}/100 (lower priority based on value and probability)`);
  }
  
  if (reasons.length === 0) {
    reasons.push(`Standard lead profile. Monitor for engagement signals.`);
  }
  
  return reasons.join(". ") + ".";
}



























