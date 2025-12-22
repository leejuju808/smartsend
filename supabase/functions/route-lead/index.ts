// Block 21768 — SmartSend Roofing Lead Routing Brain v1
// Automatically assign every new lead to the best estimator
// based on availability, performance score, workload balance, job type, and service area matching.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface RouteLeadInput {
  lead_id: string;
  zipcode?: string;
  job_type?: string; // 'insurance' | 'retail'
  workspace_id: string;
}

interface EstimatorCandidate {
  estimator_id: string;
  is_available: boolean;
  score: number; // Performance score weight (0-1)
  final_weight: number;
  zone_match?: boolean;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase configuration");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const input: RouteLeadInput = await req.json();

    if (!input.lead_id || !input.workspace_id) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: lead_id, workspace_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[Route Lead] Routing lead ${input.lead_id} for workspace ${input.workspace_id}`);

    // ============================================================================
    // 1. FETCH ALL ESTIMATORS FOR THIS WORKSPACE
    // ============================================================================
    // Get workspace members who are estimators (via contractor_roles or profiles)
    // First, get all workspace members
    const { data: workspaceMembers, error: membersError } = await supabase
      .from("workspace_members")
      .select("user_id, role")
      .eq("workspace_id", input.workspace_id);

    if (membersError) {
      console.error("Error fetching workspace members:", membersError);
      throw membersError;
    }

    // Get contractor roles to identify estimators
    const userIds = (workspaceMembers || []).map((m) => m.user_id);
    const { data: contractorRoles, error: rolesError } = await supabase
      .from("contractor_roles")
      .select("user_id, role_type")
      .eq("workspace_id", input.workspace_id)
      .in("user_id", userIds);

    if (rolesError) {
      console.error("Error fetching contractor roles:", rolesError);
      // Continue - we'll use all workspace members as fallback
    }

    // Filter to estimators: sales_rep, storm_rep, insurance_specialist, or any user if no roles exist
    const estimatorUserIds = new Set<string>();
    if (contractorRoles && contractorRoles.length > 0) {
      contractorRoles
        .filter((cr) => 
          cr.role_type === "sales_rep" || 
          cr.role_type === "storm_rep" || 
          cr.role_type === "insurance_specialist"
        )
        .forEach((cr) => estimatorUserIds.add(cr.user_id));
    } else {
      // Fallback: if no contractor_roles, use all workspace members
      userIds.forEach((id) => estimatorUserIds.add(id));
    }

    if (estimatorUserIds.size === 0) {
      return new Response(
        JSON.stringify({ error: "No estimators found for this workspace" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============================================================================
    // 2. GET AVAILABILITY STATUS
    // ============================================================================
    const { data: availability, error: availError } = await supabase
      .from("estimator_availability")
      .select("estimator_id, is_available")
      .in("estimator_id", Array.from(estimatorUserIds))
      .eq("workspace_id", input.workspace_id);

    if (availError) {
      console.error("Error fetching availability:", availError);
      // Continue with default availability (true)
    }

    const availabilityMap = new Map<string, boolean>();
    (availability || []).forEach((a) => {
      availabilityMap.set(a.estimator_id, a.is_available);
    });

    // ============================================================================
    // 3. GET LATEST SCORECARDS (PERFORMANCE SCORES)
    // ============================================================================
    const { data: scorecards, error: scorecardsError } = await supabase
      .from("estimator_scorecards")
      .select("estimator_id, final_letter_grade")
      .eq("workspace_id", input.workspace_id)
      .in("estimator_id", Array.from(estimatorUserIds))
      .order("period_end", { ascending: false });

    if (scorecardsError) {
      console.error("Error fetching scorecards:", scorecardsError);
      // Continue with default scores
    }

    // Map estimator to their latest scorecard
    const scorecardMap = new Map<string, string>();
    (scorecards || []).forEach((sc) => {
      if (!scorecardMap.has(sc.estimator_id)) {
        scorecardMap.set(sc.estimator_id, sc.final_letter_grade || "F");
      }
    });

    // ============================================================================
    // 4. GET ZONE MATCHES (if zipcode provided)
    // ============================================================================
    let zoneMatches = new Set<string>();
    if (input.zipcode) {
      const { data: zones, error: zonesError } = await supabase
        .from("estimator_zones")
        .select("estimator_id")
        .eq("workspace_id", input.workspace_id)
        .eq("zipcode", input.zipcode);

      if (!zonesError && zones) {
        zones.forEach((z) => zoneMatches.add(z.estimator_id));
      }
    }

    // ============================================================================
    // 5. GET WORKLOAD BALANCE (count of leads assigned to each estimator)
    // ============================================================================
    const { data: leadCounts, error: leadCountsError } = await supabase
      .from("leads")
      .select("estimator_id")
      .eq("workspace_id", input.workspace_id)
      .not("estimator_id", "is", null)
      .in("estimator_id", Array.from(estimatorUserIds));

    if (leadCountsError) {
      console.error("Error fetching lead counts:", leadCountsError);
    }

    const workloadMap = new Map<string, number>();
    (leadCounts || []).forEach((lead) => {
      if (lead.estimator_id) {
        workloadMap.set(
          lead.estimator_id,
          (workloadMap.get(lead.estimator_id) || 0) + 1
        );
      }
    });

    // ============================================================================
    // 6. BUILD ESTIMATOR CANDIDATES WITH SCORING
    // ============================================================================
    const assignable: EstimatorCandidate[] = Array.from(estimatorUserIds).map((estimatorId) => {
      const isAvailable = availabilityMap.get(estimatorId) ?? true;
      const letterGrade = scorecardMap.get(estimatorId) || "F";
      const score = letterToWeight(letterGrade);
      const zoneMatch = input.zipcode ? zoneMatches.has(estimatorId) : false;
      const workload = workloadMap.get(estimatorId) || 0;

      return {
        estimator_id: estimatorId,
        is_available: isAvailable,
        score,
        final_weight: 0, // Will calculate below
        zone_match: zoneMatch,
      };
    });

    // ============================================================================
    // 7. CALCULATE FINAL WEIGHTS
    // Rule 1: Availability First (1.0 if available, 0.5 if not)
    // Rule 2: Performance Weight (from scorecard)
    // Rule 3: Workload Balancing (penalize estimators with more leads)
    // Rule 4: Zone Matching (bonus if zipcode matches)
    // Rule 5: Job Type Matching (bonus for insurance jobs → best closer)
    // ============================================================================
    const maxWorkload = Math.max(...assignable.map((a) => workloadMap.get(a.estimator_id) || 0), 1);

    assignable.forEach((est) => {
      const workload = workloadMap.get(est.estimator_id) || 0;
      const workloadPenalty = 1 - (workload / (maxWorkload + 1)) * 0.2; // Max 20% penalty
      const zoneBonus = est.zone_match ? 1.2 : 1.0; // 20% bonus for zone match
      
      // Job type bonus: insurance jobs favor higher performers
      const jobTypeBonus = 
        input.job_type === "insurance" && est.score >= 0.8 ? 1.15 : 1.0;

      est.final_weight = 
        (est.is_available ? 1.0 : 0.5) * 
        est.score * 
        workloadPenalty * 
        zoneBonus * 
        jobTypeBonus;
    });

    // ============================================================================
    // 8. PICK HIGHEST WEIGHT ESTIMATOR
    // ============================================================================
    assignable.sort((a, b) => b.final_weight - a.final_weight);
    const chosen = assignable[0];

    if (!chosen) {
      return new Response(
        JSON.stringify({ error: "No eligible estimator found" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============================================================================
    // 9. ASSIGN LEAD TO ESTIMATOR
    // ============================================================================
    const { error: updateError } = await supabase
      .from("leads")
      .update({ estimator_id: chosen.estimator_id })
      .eq("id", input.lead_id);

    if (updateError) {
      console.error("Error assigning lead:", updateError);
      throw updateError;
    }

    // ============================================================================
    // 10. LOG ROUTING DECISION
    // ============================================================================
    const reasoning = {
      zipcode: input.zipcode || null,
      job_type: input.job_type || null,
      weights: assignable.map((w) => ({
        estimator_id: w.estimator_id,
        is_available: w.is_available,
        score: w.score,
        final_weight: w.final_weight,
        zone_match: w.zone_match || false,
      })),
      chosen: {
        estimator_id: chosen.estimator_id,
        final_weight: chosen.final_weight,
      },
    };

    const { error: logError } = await supabase
      .from("lead_routing_log")
      .insert({
        lead_id: input.lead_id,
        estimator_id: chosen.estimator_id,
        workspace_id: input.workspace_id,
        reasoning,
      });

    if (logError) {
      console.error("Error logging routing decision:", logError);
      // Don't fail the request if logging fails
    }

    return new Response(
      JSON.stringify({ 
        assigned_to: chosen.estimator_id,
        reasoning 
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[Route Lead] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function letterToWeight(letter: string): number {
  switch (letter) {
    case "A":
      return 1.0; // 90% priority
    case "B":
      return 0.8; // 70% priority (adjusted to match spec)
    case "C":
      return 0.6; // 50% priority
    case "D":
      return 0.4; // 30% priority
    default:
      return 0.2; // F or unknown
  }
}









































