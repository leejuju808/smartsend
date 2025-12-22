// Block 67000 — SmartSend Roofing "AI Crew Training Insights + Skill Gap Detection System" v1
// API Route: /api/crew/update-history
// POST - Stores performance snapshot for month-to-month comparison

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
    const { 
      crew_member_id, 
      crew_id, 
      workspace_id,
      snapshot_period_start,
      snapshot_period_end,
      snapshot_type = "monthly"
    } = body;

    if (!crew_member_id && !crew_id) {
      return NextResponse.json(
        { error: "crew_member_id or crew_id is required" },
        { status: 400 }
      );
    }

    if (!workspace_id) {
      // Get workspace_id from crew or crew_member
      if (crew_id) {
        const { data: crew } = await supabase
          .from("crews")
          .select("workspace_id")
          .eq("id", crew_id)
          .single();
        if (crew?.workspace_id) {
          body.workspace_id = crew.workspace_id;
        }
      } else if (crew_member_id) {
        const { data: member } = await supabase
          .from("crew_members")
          .select("workspace_id")
          .eq("id", crew_member_id)
          .single();
        if (member?.workspace_id) {
          body.workspace_id = member.workspace_id;
        }
      }
    }

    if (!body.workspace_id) {
      return NextResponse.json(
        { error: "workspace_id is required" },
        { status: 400 }
      );
    }

    // Verify access
    const { data: member } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", body.workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!member) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    // Calculate period dates if not provided
    let periodStart = snapshot_period_start;
    let periodEnd = snapshot_period_end;

    if (!periodStart || !periodEnd) {
      const now = new Date();
      if (snapshot_type === "monthly") {
        periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
        periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];
      } else if (snapshot_type === "weekly") {
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - now.getDay());
        periodStart = weekStart.toISOString().split("T")[0];
        periodEnd = new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      } else if (snapshot_type === "quarterly") {
        const quarter = Math.floor(now.getMonth() / 3);
        periodStart = new Date(now.getFullYear(), quarter * 3, 1).toISOString().split("T")[0];
        periodEnd = new Date(now.getFullYear(), (quarter + 1) * 3, 0).toISOString().split("T")[0];
      }
    }

    // Get skill scores for this period
    let scoresQuery = supabase
      .from("crew_skill_scores")
      .select("*")
      .gte("created_at", periodStart)
      .lte("created_at", periodEnd + "T23:59:59");

    if (crew_member_id) {
      scoresQuery = scoresQuery.eq("crew_member_id", crew_member_id);
    } else if (crew_id) {
      scoresQuery = scoresQuery.eq("crew_id", crew_id);
    }

    const { data: periodScores } = await scoresQuery;

    // Calculate average skill snapshot
    const skillSnapshot: any = {};
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
      const values = (periodScores || [])
        .map(s => s[skill])
        .filter(v => v !== null && v !== undefined);
      
      if (values.length > 0) {
        skillSnapshot[skill] = Math.round(
          values.reduce((a, b) => a + b, 0) / values.length
        );
      }
    });

    // Calculate overall average
    const overallValues = Object.values(skillSnapshot).filter(v => v !== null && v !== undefined) as number[];
    if (overallValues.length > 0) {
      skillSnapshot.overall = Math.round(
        overallValues.reduce((a, b) => a + b, 0) / overallValues.length
      );
    }

    // Get jobs completed in period
    let jobsQuery = supabase
      .from("roofing_jobs")
      .select("*")
      .gte("created_at", periodStart)
      .lte("created_at", periodEnd + "T23:59:59")
      .eq("status", "completed");

    if (crew_id) {
      jobsQuery = jobsQuery.eq("crew_id", crew_id);
    } else if (crew_member_id) {
      const { data: member } = await supabase
        .from("crew_members")
        .select("crew_id")
        .eq("id", crew_member_id)
        .single();
      if (member?.crew_id) {
        jobsQuery = jobsQuery.eq("crew_id", member.crew_id);
      }
    }

    const { data: jobs } = await jobsQuery;
    const jobsCompleted = jobs?.length || 0;

    // Calculate average quality and risk scores
    const jobIds = jobs?.map(j => j.id) || [];
    let averageQualityScore = null;
    let averageRiskScore = null;

    if (jobIds.length > 0) {
      const { data: qualityScores } = await supabase
        .from("crew_skill_scores")
        .select("overall")
        .in("job_id", jobIds)
        .not("overall", "is", null);

      if (qualityScores && qualityScores.length > 0) {
        averageQualityScore = Math.round(
          qualityScores.reduce((sum, s) => sum + (s.overall || 0), 0) / qualityScores.length
        );
      }

      const { data: riskAssessments } = await supabase
        .from("risk_assessments")
        .select("risk_score")
        .in("job_id", jobIds);

      if (riskAssessments && riskAssessments.length > 0) {
        averageRiskScore = Math.round(
          riskAssessments.reduce((sum, r) => sum + (r.risk_score || 0), 0) / riskAssessments.length
        );
      }
    }

    // Count callbacks and warranty issues
    let callbackCount = 0;
    let warrantyIssuesCount = 0;

    if (jobIds.length > 0) {
      const { data: serviceCalls } = await supabase
        .from("job_service_calls")
        .select("id, is_warranty")
        .in("job_id", jobIds)
        .eq("status", "completed");

      callbackCount = serviceCalls?.length || 0;
      warrantyIssuesCount = serviceCalls?.filter(sc => sc.is_warranty).length || 0;
    }

    // Count training completed
    let trainingQuery = supabase
      .from("crew_training_recommendations")
      .select("id")
      .eq("status", "completed")
      .gte("completed_at", periodStart)
      .lte("completed_at", periodEnd + "T23:59:59");

    if (crew_member_id) {
      trainingQuery = trainingQuery.eq("crew_member_id", crew_member_id);
    } else if (crew_id) {
      trainingQuery = trainingQuery.eq("crew_id", crew_id);
    }

    const { data: trainingCompleted } = await trainingQuery;
    const trainingCompletedCount = trainingCompleted?.length || 0;

    // Get previous period for comparison
    const previousPeriodStart = new Date(periodStart);
    const previousPeriodEnd = new Date(periodEnd);
    
    if (snapshot_type === "monthly") {
      previousPeriodStart.setMonth(previousPeriodStart.getMonth() - 1);
      previousPeriodEnd.setMonth(previousPeriodEnd.getMonth() - 1);
    } else if (snapshot_type === "weekly") {
      previousPeriodStart.setDate(previousPeriodStart.getDate() - 7);
      previousPeriodEnd.setDate(previousPeriodEnd.getDate() - 7);
    } else if (snapshot_type === "quarterly") {
      previousPeriodStart.setMonth(previousPeriodStart.getMonth() - 3);
      previousPeriodEnd.setMonth(previousPeriodEnd.getMonth() - 3);
    }

    let prevHistoryQuery = supabase
      .from("crew_performance_history")
      .select("*")
      .eq("snapshot_type", snapshot_type)
      .gte("snapshot_period_start", previousPeriodStart.toISOString().split("T")[0])
      .lte("snapshot_period_end", previousPeriodEnd.toISOString().split("T")[0])
      .order("created_at", { ascending: false })
      .limit(1);

    if (crew_member_id) {
      prevHistoryQuery = prevHistoryQuery.eq("crew_member_id", crew_member_id);
    } else if (crew_id) {
      prevHistoryQuery = prevHistoryQuery.eq("crew_id", crew_id);
    }

    const { data: previousHistory } = await prevHistoryQuery;

    // Calculate improvement percentage
    let improvementPercentage = null;
    let strongestSkill = null;
    let weakestSkill = null;

    if (previousHistory && previousHistory[0] && skillSnapshot.overall) {
      const prevOverall = previousHistory[0].skill_snapshot?.overall;
      if (prevOverall) {
        improvementPercentage = Math.round(
          ((skillSnapshot.overall - prevOverall) / prevOverall) * 100
        );
      }

      // Find strongest and weakest skills
      const skillEntries = Object.entries(skillSnapshot)
        .filter(([key]) => skillAreas.includes(key))
        .sort(([, a]: any, [, b]: any) => (b || 0) - (a || 0));
      
      if (skillEntries.length > 0) {
        strongestSkill = skillEntries[0][0];
        weakestSkill = skillEntries[skillEntries.length - 1][0];
      }
    }

    // Save history record
    const historyData = {
      workspace_id: body.workspace_id,
      crew_member_id: crew_member_id || null,
      crew_id: crew_id || null,
      snapshot_period_start: periodStart,
      snapshot_period_end: periodEnd,
      snapshot_type,
      skill_snapshot: skillSnapshot,
      jobs_completed: jobsCompleted,
      average_quality_score: averageQualityScore,
      average_risk_score: averageRiskScore,
      callback_count: callbackCount,
      warranty_issues_count: warrantyIssuesCount,
      training_completed_count: trainingCompletedCount,
      improvement_percentage: improvementPercentage,
      strongest_skill: strongestSkill,
      weakest_skill: weakestSkill
    };

    const { data: savedHistory, error: saveError } = await supabase
      .from("crew_performance_history")
      .insert(historyData)
      .select()
      .single();

    if (saveError) {
      console.error("Error saving performance history:", saveError);
      return NextResponse.json(
        { error: "Failed to save performance history", details: saveError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      history: savedHistory,
      improvement_from_previous: improvementPercentage ? `${improvementPercentage > 0 ? '+' : ''}${improvementPercentage}%` : "No previous data",
      summary: {
        period_start: periodStart,
        period_end: periodEnd,
        jobs_completed: jobsCompleted,
        average_quality: averageQualityScore,
        improvement_percentage: improvementPercentage,
        strongest_skill: strongestSkill,
        weakest_skill: weakestSkill
      }
    });
  } catch (error: any) {
    console.error("Error in update-history route:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}




























