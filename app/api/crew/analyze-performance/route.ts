// Block 67000 — SmartSend Roofing "AI Crew Training Insights + Skill Gap Detection System" v1
// API Route: /api/crew/analyze-performance
// POST - Analyzes crew performance based on QC photos, risk flags, delay logs, and job data

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface SkillScores {
  tear_off?: number;
  shingle_installation?: number;
  flashing?: number;
  ventilation?: number;
  ridge?: number;
  cleanup?: number;
  safety?: number;
  time_management?: number;
}

interface ErrorPattern {
  skill_area: string;
  error_type: string;
  description: string;
  frequency: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

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
    const { job_id, crew_id, crew_member_id, workspace_id } = body;

    if (!job_id && !crew_id && !crew_member_id) {
      return NextResponse.json(
        { error: "job_id, crew_id, or crew_member_id is required" },
        { status: 400 }
      );
    }

    // Get workspace_id if not provided
    let workspaceId = workspace_id;
    if (!workspaceId) {
      if (job_id) {
        const { data: job } = await supabase
          .from("roofing_jobs")
          .select("workspace_id")
          .eq("id", job_id)
          .single();
        workspaceId = job?.workspace_id;
      } else if (crew_id) {
        const { data: crew } = await supabase
          .from("crews")
          .select("workspace_id")
          .eq("id", crew_id)
          .single();
        workspaceId = crew?.workspace_id;
      } else if (crew_member_id) {
        const { data: member } = await supabase
          .from("crew_members")
          .select("workspace_id")
          .eq("id", crew_member_id)
          .single();
        workspaceId = member?.workspace_id;
      }
    }

    if (!workspaceId) {
      return NextResponse.json(
        { error: "Could not determine workspace_id" },
        { status: 400 }
      );
    }

    // Verify access
    const { data: member } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .single();

    if (!member) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    // Gather data for analysis
    let jobsToAnalyze: any[] = [];
    
    if (job_id) {
      const { data: jobs } = await supabase
        .from("roofing_jobs")
        .select("*")
        .eq("id", job_id);
      jobsToAnalyze = jobs || [];
    } else if (crew_id) {
      const { data: jobs } = await supabase
        .from("roofing_jobs")
        .select("*")
        .eq("crew_id", crew_id)
        .order("created_at", { ascending: false })
        .limit(10); // Last 10 jobs for pattern detection
      jobsToAnalyze = jobs || [];
    } else if (crew_member_id) {
      // Get jobs where this crew member worked
      const { data: member } = await supabase
        .from("crew_members")
        .select("crew_id")
        .eq("id", crew_member_id)
        .single();
      
      if (member?.crew_id) {
        const { data: jobs } = await supabase
          .from("roofing_jobs")
          .select("*")
          .eq("crew_id", member.crew_id)
          .order("created_at", { ascending: false })
          .limit(10);
        jobsToAnalyze = jobs || [];
      }
    }

    if (jobsToAnalyze.length === 0) {
      return NextResponse.json(
        { error: "No jobs found to analyze" },
        { status: 404 }
      );
    }

    // Collect QC photos, risk assessments, and issues for all jobs
    const jobIds = jobsToAnalyze.map(j => j.id);
    
    const [qcPhotosResult, riskAssessmentsResult, riskAlertsResult, punchListResult, warrantyIssuesResult] = await Promise.all([
      // QC Photos
      supabase
        .from("qc_photos")
        .select("*")
        .in("job_id", jobIds),
      
      // Risk Assessments
      supabase
        .from("risk_assessments")
        .select("*")
        .in("job_id", jobIds),
      
      // Risk Alerts
      supabase
        .from("risk_alerts")
        .select("*")
        .in("job_id", jobIds),
      
      // Punch Lists
      supabase
        .from("punch_list")
        .select("*")
        .in("job_id", jobIds)
        .eq("status", "needs_attention"),
      
      // Warranty Issues
      supabase
        .from("job_service_calls")
        .select("*")
        .in("job_id", jobIds)
        .eq("is_warranty", true)
    ]);

    const qcPhotos = qcPhotosResult.data || [];
    const riskAssessments = riskAssessmentsResult.data || [];
    const riskAlerts = riskAlertsResult.data || [];
    const punchListItems = punchListResult.data || [];
    const warrantyIssues = warrantyIssuesResult.data || [];

    // Analyze patterns and calculate skill scores
    const errorPatterns: ErrorPattern[] = [];
    const skillScores: SkillScores = {};

    // Analyze risk assessments for workmanship issues
    riskAssessments.forEach((ra: any) => {
      const riskFactors = ra.risk_factors || {};
      const workmanshipRisks = riskFactors.workmanship_risks || [];
      
      workmanshipRisks.forEach((risk: string) => {
        // Map risk types to skill areas
        if (risk.includes("flashing") || risk.includes("step")) {
          errorPatterns.push({
            skill_area: "flashing",
            error_type: risk,
            description: `Flashing issue detected: ${risk}`,
            frequency: 1,
            severity: ra.risk_score > 70 ? "high" : ra.risk_score > 40 ? "medium" : "low"
          });
        } else if (risk.includes("shingle") || risk.includes("nail")) {
          errorPatterns.push({
            skill_area: "shingle_installation",
            error_type: risk,
            description: `Shingle installation issue: ${risk}`,
            frequency: 1,
            severity: ra.risk_score > 70 ? "high" : ra.risk_score > 40 ? "medium" : "low"
          });
        } else if (risk.includes("ventilation") || risk.includes("vent")) {
          errorPatterns.push({
            skill_area: "ventilation",
            error_type: risk,
            description: `Ventilation issue: ${risk}`,
            frequency: 1,
            severity: ra.risk_score > 70 ? "high" : ra.risk_score > 40 ? "medium" : "low"
          });
        } else if (risk.includes("ridge")) {
          errorPatterns.push({
            skill_area: "ridge",
            error_type: risk,
            description: `Ridge cap issue: ${risk}`,
            frequency: 1,
            severity: ra.risk_score > 70 ? "high" : ra.risk_score > 40 ? "medium" : "low"
          });
        }
      });
    });

    // Analyze risk alerts
    riskAlerts.forEach((alert: any) => {
      if (alert.alert_type === "workmanship_issue" || alert.alert_type === "installation_error") {
        const description = alert.description || "";
        
        if (description.toLowerCase().includes("flashing")) {
          errorPatterns.push({
            skill_area: "flashing",
            error_type: alert.alert_type,
            description: alert.description,
            frequency: 1,
            severity: alert.severity || "medium"
          });
        } else if (description.toLowerCase().includes("shingle") || description.toLowerCase().includes("nail")) {
          errorPatterns.push({
            skill_area: "shingle_installation",
            error_type: alert.alert_type,
            description: alert.description,
            frequency: 1,
            severity: alert.severity || "medium"
          });
        }
      }
    });

    // Count error patterns by skill area
    const errorCounts: Record<string, { count: number; severity: string }> = {};
    errorPatterns.forEach(error => {
      if (!errorCounts[error.skill_area]) {
        errorCounts[error.skill_area] = { count: 0, severity: error.severity };
      }
      errorCounts[error.skill_area].count++;
    });

    // Calculate skill scores (inverse of error frequency)
    const maxErrors = Math.max(...Object.values(errorCounts).map(e => e.count), 1);
    const skillAreas = [
      "tear_off",
      "shingle_installation",
      "flashing",
      "ventilation",
      "ridge",
      "cleanup",
      "safety",
      "time_management"
    ];

    skillAreas.forEach(skill => {
      const errors = errorCounts[skill]?.count || 0;
      // Base score of 80, reduced by errors
      const errorPenalty = Math.min((errors / maxErrors) * 40, 60);
      skillScores[skill as keyof SkillScores] = Math.round(Math.max(20, 80 - errorPenalty));
    });

    // Adjust scores based on warranty issues and punch list items
    if (warrantyIssues.length > 0) {
      // Reduce quality scores if warranty issues exist
      Object.keys(skillScores).forEach(skill => {
        skillScores[skill as keyof SkillScores] = Math.max(
          20,
          (skillScores[skill as keyof SkillScores] || 80) - (warrantyIssues.length * 5)
        );
      });
    }

    // Adjust cleanup score based on punch list
    if (punchListItems.length > 0) {
      skillScores.cleanup = Math.max(20, (skillScores.cleanup || 80) - (punchListItems.length * 10));
    }

    // Calculate time management from job completion times
    if (jobsToAnalyze.length > 0) {
      const scheduledJobs = jobsToAnalyze.filter(j => j.scheduled_start_date && j.scheduled_end_date);
      if (scheduledJobs.length > 0) {
        const delays = scheduledJobs.map(job => {
          const scheduledDays = Math.ceil(
            (new Date(job.scheduled_end_date).getTime() - new Date(job.scheduled_start_date).getTime()) / (1000 * 60 * 60 * 24)
          );
          const actualDays = job.completed_at 
            ? Math.ceil((new Date(job.completed_at).getTime() - new Date(job.scheduled_start_date).getTime()) / (1000 * 60 * 60 * 24))
            : scheduledDays;
          return actualDays - scheduledDays;
        });
        
        const avgDelay = delays.reduce((a, b) => a + b, 0) / delays.length;
        // Score: 100 if on time, reduces by 10 points per day delay (max penalty 60)
        skillScores.time_management = Math.max(20, 100 - Math.abs(avgDelay) * 10);
      }
    }

    // Determine assessment method
    let assessmentMethod = "combined";
    if (qcPhotos.length > 0 && riskAssessments.length === 0) {
      assessmentMethod = "qc_inspection";
    } else if (riskAssessments.length > 0 && qcPhotos.length === 0) {
      assessmentMethod = "ai_analysis";
    }

    // Save skill scores to database
    const scoreData: any = {
      workspace_id: workspaceId,
      assessment_method: assessmentMethod,
      assessment_source: {
        qc_photos_count: qcPhotos.length,
        risk_assessments_count: riskAssessments.length,
        risk_alerts_count: riskAlerts.length,
        punch_list_items_count: punchListItems.length,
        warranty_issues_count: warrantyIssues.length
      },
      ...skillScores
    };

    if (job_id) {
      scoreData.job_id = job_id;
      const { data: job } = await supabase
        .from("roofing_jobs")
        .select("crew_id")
        .eq("id", job_id)
        .single();
      if (job?.crew_id) scoreData.crew_id = job.crew_id;
    } else if (crew_id) {
      scoreData.crew_id = crew_id;
    }

    if (crew_member_id) {
      scoreData.crew_member_id = crew_member_id;
    }

    const { data: savedScores, error: saveError } = await supabase
      .from("crew_skill_scores")
      .insert(scoreData)
      .select()
      .single();

    if (saveError) {
      console.error("Error saving skill scores:", saveError);
      // Continue anyway, return the analysis
    }

    // Aggregate error patterns
    const aggregatedPatterns: Record<string, ErrorPattern> = {};
    errorPatterns.forEach(error => {
      const key = `${error.skill_area}_${error.error_type}`;
      if (!aggregatedPatterns[key]) {
        aggregatedPatterns[key] = { ...error };
      } else {
        aggregatedPatterns[key].frequency += error.frequency;
      }
    });

    return NextResponse.json({
      success: true,
      skill_scores: savedScores || skillScores,
      error_patterns: Object.values(aggregatedPatterns),
      mistakes: Object.values(aggregatedPatterns).map(p => ({
        skill_area: p.skill_area,
        description: p.description,
        frequency: p.frequency,
        severity: p.severity
      })),
      analysis_summary: {
        jobs_analyzed: jobsToAnalyze.length,
        qc_photos_count: qcPhotos.length,
        risk_assessments_count: riskAssessments.length,
        risk_alerts_count: riskAlerts.length,
        warranty_issues_count: warrantyIssues.length,
        punch_list_items_count: punchListItems.length
      }
    });
  } catch (error: any) {
    console.error("Error in analyze-performance route:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}




























