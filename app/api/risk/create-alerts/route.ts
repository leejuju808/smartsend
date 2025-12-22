// Block 63000 — SmartSend Roofing Risk Detection + Warranty Liability AI System v1
// API Route: Create Risk Alerts
// POST /api/risk/create-alerts

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Creates alerts and tasks if risk crosses threshold
 * Helps roofers: Automates safety + quality control
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
    const { risk_assessment_id, threshold = 40 } = body;

    if (!risk_assessment_id) {
      return NextResponse.json(
        { error: "risk_assessment_id is required" },
        { status: 400 }
      );
    }

    // Get risk assessment
    const { data: assessment, error: assessmentError } = await supabase
      .from("risk_assessments")
      .select("*")
      .eq("id", risk_assessment_id)
      .single();

    if (assessmentError || !assessment) {
      return NextResponse.json(
        { error: "Risk assessment not found" },
        { status: 404 }
      );
    }

    // Check if risk score exceeds threshold
    if (assessment.risk_score < threshold) {
      return NextResponse.json({
        success: true,
        message: "Risk score below threshold, no alerts created",
        alerts_created: 0,
      });
    }

    // Call database function to create alerts
    const { data: alertsCreated, error: functionError } = await supabase.rpc(
      "create_risk_alerts_from_assessment",
      {
        p_risk_assessment_id: risk_assessment_id,
        p_threshold: threshold,
      }
    );

    if (functionError) {
      console.error("Error creating alerts:", functionError);
      // Fallback: Create alerts manually
      return await createAlertsManually(supabase, assessment, threshold);
    }

    // Get created alerts
    const { data: alerts } = await supabase
      .from("risk_alerts")
      .select("*")
      .eq("risk_assessment_id", risk_assessment_id)
      .order("created_at", { ascending: false });

    return NextResponse.json({
      success: true,
      alerts_created: alerts?.length || 0,
      alerts: alerts || [],
    });
  } catch (error: any) {
    console.error("Error in create-alerts API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * Fallback: Create alerts manually if function fails
 */
async function createAlertsManually(
  supabase: any,
  assessment: any,
  threshold: number
) {
  const alerts: any[] = [];
  const recommendations = assessment.recommendations || [];

  for (const rec of recommendations) {
    const severity = rec.priority || "medium";
    
    // Only create alerts for medium+ priority
    if (severity === "low") continue;

    const { data: alert, error } = await supabase
      .from("risk_alerts")
      .insert({
        job_id: assessment.job_id,
        workspace_id: assessment.workspace_id,
        risk_assessment_id: assessment.id,
        alert_type: rec.type || "workmanship_issue",
        message: rec.action || "Review installation",
        severity: severity,
        related_checklist_item: rec.checklist_item || null,
      })
      .select()
      .single();

    if (!error && alert) {
      alerts.push(alert);

      // Create task for high/critical alerts
      if (severity === "high" || severity === "critical") {
        try {
          const { data: task } = await supabase
            .from("roofing_tasks")
            .insert({
              workspace_id: assessment.workspace_id,
              job_id: assessment.job_id,
              title: `Risk Alert: ${rec.action || "Review installation"}`,
              description: rec.reason || "AI detected risk in installation",
              priority: severity === "critical" ? "high" : "medium",
              status: "open",
              creation_source: "risk_detection",
              metadata: {
                risk_alert_id: alert.id,
                risk_assessment_id: assessment.id,
              },
            })
            .select()
            .single();

          if (task) {
            await supabase
              .from("risk_alerts")
              .update({ task_id: task.id })
              .eq("id", alert.id);
          }
        } catch (taskError) {
          console.error("Error creating task:", taskError);
        }
      }
    }
  }

  return {
    success: true,
    alerts_created: alerts.length,
    alerts,
  };
}




























