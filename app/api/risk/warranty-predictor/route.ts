// Block 63000 — SmartSend Roofing Risk Detection + Warranty Liability AI System v1
// API Route: Warranty Predictor
// POST /api/risk/warranty-predictor

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Predicts future warranty events, cost exposure, weak materials
 * Helps roofers: Avoids financial surprises
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
    const { job_id, risk_assessment_id } = body;

    if (!job_id && !risk_assessment_id) {
      return NextResponse.json(
        { error: "job_id or risk_assessment_id is required" },
        { status: 400 }
      );
    }

    // Get risk assessment
    let assessment;
    if (risk_assessment_id) {
      const { data, error } = await supabase
        .from("risk_assessments")
        .select("*")
        .eq("id", risk_assessment_id)
        .single();
      
      if (error || !data) {
        return NextResponse.json(
          { error: "Risk assessment not found" },
          { status: 404 }
        );
      }
      assessment = data;
    } else {
      const { data, error } = await supabase
        .from("risk_assessments")
        .select("*")
        .eq("job_id", job_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      
      if (error || !data) {
        return NextResponse.json(
          { error: "No risk assessment found. Run analyze-installation first." },
          { status: 404 }
        );
      }
      assessment = data;
    }

    // Get job details for context
    const { data: job } = await supabase
      .from("roofing_jobs")
      .select("*, workspace_id")
      .eq("id", assessment.job_id)
      .single();

    // Extract warranty prediction from assessment
    const warrantyRisk = assessment.warranty_risk || {};
    
    // Calculate predicted liability
    const predictedLiability = 
      (warrantyRisk.estimated_cost_range?.min || 0) + 
      (warrantyRisk.estimated_cost_range?.max || 0) / 2;

    // Calculate predicted date (average of timeline months)
    let predictedDate: Date | null = null;
    if (warrantyRisk.predicted_timeline_months && warrantyRisk.predicted_timeline_months.length > 0) {
      const avgMonths = warrantyRisk.predicted_timeline_months.reduce((a: number, b: number) => a + b, 0) / warrantyRisk.predicted_timeline_months.length;
      predictedDate = new Date();
      predictedDate.setMonth(predictedDate.getMonth() + Math.round(avgMonths));
    }

    // Save prediction to history
    const { data: prediction, error: predictionError } = await supabase
      .from("warranty_prediction_history")
      .insert({
        job_id: assessment.job_id,
        workspace_id: assessment.workspace_id,
        risk_assessment_id: assessment.id,
        predicted_liability: predictedLiability,
        predicted_date: predictedDate?.toISOString().split("T")[0] || null,
        factors: {
          primary_factors: assessment.risk_factors?.installation_risks || [],
          secondary_factors: [
            ...(assessment.risk_factors?.material_risks || []),
            ...(assessment.risk_factors?.workmanship_risks || []),
          ],
          confidence: Math.min(assessment.risk_score + 20, 100),
        },
      })
      .select()
      .single();

    if (predictionError) {
      console.error("Error saving prediction:", predictionError);
    }

    return NextResponse.json({
      success: true,
      prediction: {
        probability: warrantyRisk.probability || 0,
        predicted_claim_types: warrantyRisk.predicted_claim_types || [],
        predicted_timeline_months: warrantyRisk.predicted_timeline_months || [],
        estimated_cost_range: warrantyRisk.estimated_cost_range || { min: 0, max: 0 },
        predicted_liability: predictedLiability,
        predicted_date: predictedDate?.toISOString().split("T")[0] || null,
        factors: {
          primary_factors: assessment.risk_factors?.installation_risks || [],
          secondary_factors: [
            ...(assessment.risk_factors?.material_risks || []),
            ...(assessment.risk_factors?.workmanship_risks || []),
          ],
        },
      },
      job: job ? {
        id: job.id,
        title: job.title,
        job_value: job.job_value,
      } : null,
    });
  } catch (error: any) {
    console.error("Error in warranty-predictor API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}




























