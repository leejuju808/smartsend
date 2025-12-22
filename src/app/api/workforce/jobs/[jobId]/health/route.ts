// GET /api/workforce/jobs/[jobId]/health - Get job health score

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentCompanyId } from "@/lib/company-helpers";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const companyId = await getCurrentCompanyId();
    if (!companyId) {
      return NextResponse.json({ error: "No company found" }, { status: 400 });
    }

    const { jobId } = await params;

    // Verify job belongs to company
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("id, company_id")
      .eq("id", jobId)
      .single();

    if (jobError || !job || job.company_id !== companyId) {
      return NextResponse.json(
        { error: "Job not found or access denied" },
        { status: 404 }
      );
    }

    // Calculate health score (now includes QC score)
    const { data: healthScore, error: scoreError } = await supabase.rpc(
      'calculate_job_health_score',
      { p_job_id: jobId }
    );

    if (scoreError) {
      console.error("Error calculating health score:", scoreError);
      return NextResponse.json(
        { error: scoreError.message },
        { status: 500 }
      );
    }

    // Get detailed breakdown including QC score
    const { data: breakdown, error: breakdownError } = await supabase.rpc(
      'get_job_health_breakdown',
      { p_job_id: jobId }
    );

    if (breakdownError) {
      console.error("Error getting health breakdown:", breakdownError);
    }

    // Get detailed breakdown
    const { data: delayedMilestones } = await supabase
      .from("production_milestones")
      .select("id, name")
      .eq("job_id", jobId)
      .eq("status", "delayed");

    const { data: blockers } = await supabase
      .from("milestone_blockers")
      .select(`
        id,
        description,
        blocker_type,
        milestone_id,
        production_milestones!inner(job_id, name)
      `)
      .eq("resolved", false)
      .eq("production_milestones.job_id", jobId);

    // Calculate days behind
    const { data: milestones } = await supabase
      .from("production_milestones")
      .select("due_date, status")
      .eq("job_id", jobId)
      .not("due_date", "is", null);

    let daysBehind = 0;
    if (milestones) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      milestones.forEach((m: any) => {
        if (m.status !== 'completed' && m.due_date) {
          const dueDate = new Date(m.due_date);
          if (dueDate < today) {
            const diffDays = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
            daysBehind += diffDays;
          }
        }
      });
    }

    // Determine health status
    let healthStatus: 'healthy' | 'warning' | 'critical' = 'healthy';
    if (healthScore < 50) {
      healthStatus = 'critical';
    } else if (healthScore < 80) {
      healthStatus = 'warning';
    }

    return NextResponse.json({
      health_score: healthScore,
      health_status: healthStatus,
      breakdown: breakdown || {
        production_health: 0,
        safety_score: 0,
        qc_score: 0,
        delayed_milestones: delayedMilestones?.length || 0,
        open_blockers: blockers?.length || 0,
        days_behind: daysBehind,
      },
      details: {
        delayed_milestones: delayedMilestones || [],
        blockers: blockers || [],
        production_health: breakdown?.production_health || 0,
        safety_score: breakdown?.safety_score || 0,
        qc_score: breakdown?.qc_score || 0,
      },
    });
  } catch (error: any) {
    console.error("Error in GET /api/workforce/jobs/[jobId]/health:", error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
