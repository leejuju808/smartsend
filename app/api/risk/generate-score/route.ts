// Block 63000 — SmartSend Roofing Risk Detection + Warranty Liability AI System v1
// API Route: Generate Risk Score
// POST /api/risk/generate-score

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Generates warranty + risk score for a job
 * Helps roofers: Gives a measurable risk number per job
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { job_id } = body;

    if (!job_id) {
      return NextResponse.json(
        { error: "job_id is required" },
        { status: 400 }
      );
    }

    // Get latest risk assessment
    const { data: assessment, error: assessmentError } = await supabase
      .from("risk_assessments")
      .select("*")
      .eq("job_id", job_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (assessmentError || !assessment) {
      return NextResponse.json(
        { error: "No risk assessment found. Run analyze-installation first." },
        { status: 404 }
      );
    }

    // Get risk level label
    const { data: riskLevel } = await supabase.rpc("get_risk_level_label", {
      p_score: assessment.risk_score,
    });

    return NextResponse.json({
      success: true,
      risk_score: assessment.risk_score,
      risk_level: riskLevel || getRiskLevelLabel(assessment.risk_score),
      warranty_probability: assessment.warranty_risk?.probability || 0,
      risk_factors: assessment.risk_factors,
      warranty_risk: assessment.warranty_risk,
    });
  } catch (error: any) {
    console.error("Error in generate-score API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

function getRiskLevelLabel(score: number): string {
  if (score >= 80) return "VERY HIGH";
  if (score >= 60) return "HIGH";
  if (score >= 40) return "MEDIUM";
  if (score >= 20) return "SLIGHT CAUTION";
  return "LOW";
}




























