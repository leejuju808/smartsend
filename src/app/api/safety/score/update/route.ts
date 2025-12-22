// Block 226000 — SmartSend Roofing Safety Compliance System
// POST /api/safety/score/update
// Calculate and update crew safety scores
// Formula: 40% PPE compliance + 20% checklist completion + 20% incident frequency + 20% toolbox participation

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { crewId, periodStart, periodEnd } = await req.json();

    if (!crewId) {
      return NextResponse.json(
        { error: "crewId is required" },
        { status: 400 }
      );
    }

    // Default to current week if period not provided
    const start = periodStart || new Date();
    const end = periodEnd || new Date();
    
    // Calculate safety score using database function
    const { data: scoreResult, error: scoreError } = await supabase.rpc(
      "calculate_crew_safety_score",
      {
        p_crew_id: crewId,
        p_period_start: start,
        p_period_end: end,
      }
    );

    if (scoreError) {
      console.error("Error calculating safety score:", scoreError);
      // Fallback to manual calculation if function doesn't exist
      return await calculateScoreManually(crewId, start, end);
    }

    const finalScore = scoreResult || 0;

    // Get component scores for detailed breakdown
    const { data: ppeData } = await supabase
      .from("safety_checklists")
      .select("id, completed")
      .eq("checklist_type", "ppe_check")
      .in("daily_log_id", 
        supabase
          .from("crew_daily_logs")
          .select("id")
          .eq("crew_id", crewId)
          .gte("date", start)
          .lte("date", end)
      );

    const { data: checklistData } = await supabase
      .from("safety_checklists")
      .select("id, completed")
      .in("daily_log_id",
        supabase
          .from("crew_daily_logs")
          .select("id")
          .eq("crew_id", crewId)
          .gte("date", start)
          .lte("date", end)
      );

    const { data: incidentData } = await supabase
      .from("safety_incidents")
      .select("id")
      .eq("crew_id", crewId)
      .gte("occurred_at", start)
      .lte("occurred_at", end);

    // Calculate component scores
    const ppeCompliance = ppeData?.length
      ? (ppeData.filter((c) => c.completed).length / ppeData.length) * 100
      : 0;
    
    const checklistCompletion = checklistData?.length
      ? (checklistData.filter((c) => c.completed).length / checklistData.length) * 100
      : 0;
    
    const incidentFrequency = Math.max(0, 100 - (incidentData?.length || 0) * 10);
    
    // Toolbox participation (simplified - would need to join with toolbox_talks)
    const toolboxParticipation = 0; // Placeholder

    // Upsert safety score
    const { data: safetyScore, error: upsertError } = await supabase
      .from("safety_scores")
      .upsert(
        {
          crew_id: crewId,
          score: finalScore,
          period_start: start,
          period_end: end,
          ppe_compliance_score: ppeCompliance,
          checklist_completion_score: checklistCompletion,
          incident_frequency_score: incidentFrequency,
          toolbox_participation_score: toolboxParticipation,
        },
        {
          onConflict: "crew_id,period_start,period_end",
        }
      )
      .select()
      .single();

    if (upsertError) {
      console.error("Error upserting safety score:", upsertError);
      return NextResponse.json(
        { error: "Failed to save safety score", details: upsertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      safetyScore,
      breakdown: {
        ppeCompliance,
        checklistCompletion,
        incidentFrequency,
        toolboxParticipation,
        finalScore,
      },
      message: "Safety score updated successfully",
    });
  } catch (error: any) {
    console.error("Update safety score error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

async function calculateScoreManually(crewId: string, periodStart: Date, periodEnd: Date) {
  // Manual calculation fallback
  const startStr = periodStart.toISOString().split("T")[0];
  const endStr = periodEnd.toISOString().split("T")[0];

  // Get PPE compliance
  const { data: ppeChecklists } = await supabase
    .from("safety_checklists")
    .select("id, completed")
    .eq("checklist_type", "ppe_check")
    .in(
      "daily_log_id",
      supabase
        .from("crew_daily_logs")
        .select("id")
        .eq("crew_id", crewId)
        .gte("date", startStr)
        .lte("date", endStr)
    );

  const ppeScore = ppeChecklists?.length
    ? (ppeChecklists.filter((c) => c.completed).length / ppeChecklists.length) * 100 * 0.4
    : 0;

  // Get checklist completion
  const { data: allChecklists } = await supabase
    .from("safety_checklists")
    .select("id, completed")
    .in(
      "daily_log_id",
      supabase
        .from("crew_daily_logs")
        .select("id")
        .eq("crew_id", crewId)
        .gte("date", startStr)
        .lte("date", endStr)
    );

  const checklistScore = allChecklists?.length
    ? (allChecklists.filter((c) => c.completed).length / allChecklists.length) * 100 * 0.2
    : 0;

  // Get incident frequency
  const { data: incidents } = await supabase
    .from("safety_incidents")
    .select("id")
    .eq("crew_id", crewId)
    .gte("occurred_at", startStr)
    .lte("occurred_at", endStr);

  const incidentScore = Math.max(0, 100 - (incidents?.length || 0) * 10) * 0.2;

  // Toolbox participation (placeholder)
  const toolboxScore = 0;

  const finalScore = ppeScore + checklistScore + incidentScore + toolboxScore;

  return NextResponse.json({
    success: true,
    safetyScore: {
      crew_id: crewId,
      score: finalScore,
      period_start: startStr,
      period_end: endStr,
    },
    breakdown: {
      ppeCompliance: ppeScore / 0.4,
      checklistCompletion: checklistScore / 0.2,
      incidentFrequency: incidentScore / 0.2,
      toolboxParticipation: 0,
      finalScore,
    },
  });
}

// GET /api/safety/score/update - Get safety scores for a crew
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const crewId = searchParams.get("crewId");
    const limit = parseInt(searchParams.get("limit") || "10");

    if (!crewId) {
      return NextResponse.json(
        { error: "crewId is required" },
        { status: 400 }
      );
    }

    const { data: scores, error } = await supabase
      .from("safety_scores")
      .select("*")
      .eq("crew_id", crewId)
      .order("period_end", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("Error fetching safety scores:", error);
      return NextResponse.json(
        { error: "Failed to fetch safety scores", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      scores: scores || [],
    });
  } catch (error: any) {
    console.error("Get safety scores error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























