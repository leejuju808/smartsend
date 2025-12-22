// Block 246000 — AI Recommendations API
// GET /api/production/ai/recommendations
// Returns AI-powered recommendations for production operations

import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { getActiveWorkspaceId } from "@/lib/workspace/context";

export async function GET(req: NextRequest) {
  try {
    const supabase = getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getActiveWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }

    const recommendations: any[] = [];

    // Get jobs with delays
    const { data: delayedJobs } = await supabase
      .from("job_alerts")
      .select(`
        id,
        job_id,
        message,
        metadata,
        jobs:job_id (
          id,
          title,
          address,
          scheduled_start_date,
          crew_id,
          crews:crew_id (
            id,
            name
          )
        )
      `)
      .eq("workspace_id", workspaceId)
      .eq("type", "delay")
      .eq("is_resolved", false)
      .limit(10);

    // Generate delay recommendations
    if (delayedJobs && delayedJobs.length > 0) {
      for (const alert of delayedJobs) {
        const job = alert.jobs as any;
        if (job) {
          recommendations.push({
            type: "delay",
            priority: "high",
            title: "Job Delay Detected",
            message: `Job "${job.title || job.address}" is delayed. Consider reassigning crew or adjusting schedule.`,
            action: {
              type: "reassign_crew",
              job_id: job.id,
              current_crew: job.crews?.name,
            },
            metadata: alert.metadata,
          });
        }
      }
    }

    // Get jobs with material shortages
    const { data: materialShortages } = await supabase
      .from("job_alerts")
      .select(`
        id,
        job_id,
        message,
        metadata,
        jobs:job_id (
          id,
          title,
          address,
          scheduled_start_date
        )
      `)
      .eq("workspace_id", workspaceId)
      .eq("type", "material_shortage")
      .eq("is_resolved", false)
      .limit(10);

    if (materialShortages && materialShortages.length > 0) {
      for (const alert of materialShortages) {
        const job = alert.jobs as any;
        if (job) {
          recommendations.push({
            type: "material",
            priority: "critical",
            title: "Material Shortage",
            message: `Job "${job.title || job.address}" is missing materials. Reorder immediately to avoid further delays.`,
            action: {
              type: "reorder_materials",
              job_id: job.id,
            },
            metadata: alert.metadata,
          });
        }
      }
    }

    // Get jobs with profitability risks
    const { data: profitRisks } = await supabase
      .from("job_alerts")
      .select(`
        id,
        job_id,
        message,
        metadata,
        jobs:job_id (
          id,
          title,
          address,
          job_value
        )
      `)
      .eq("workspace_id", workspaceId)
      .eq("type", "cost_risk")
      .eq("is_resolved", false)
      .limit(10);

    if (profitRisks && profitRisks.length > 0) {
      for (const alert of profitRisks) {
        const job = alert.jobs as any;
        if (job) {
          recommendations.push({
            type: "profitability",
            priority: "high",
            title: "Profitability Risk",
            message: `Job "${job.title || job.address}" is at risk of exceeding budget. Review costs and consider change order.`,
            action: {
              type: "review_costs",
              job_id: job.id,
            },
            metadata: alert.metadata,
          });
        }
      }
    }

    // Get weather risks
    const { data: weatherRisks } = await supabase
      .from("job_alerts")
      .select(`
        id,
        job_id,
        message,
        metadata,
        jobs:job_id (
          id,
          title,
          address,
          scheduled_start_date
        )
      `)
      .eq("workspace_id", workspaceId)
      .eq("type", "weather")
      .eq("is_resolved", false)
      .limit(10);

    if (weatherRisks && weatherRisks.length > 0) {
      for (const alert of weatherRisks) {
        const job = alert.jobs as any;
        if (job) {
          recommendations.push({
            type: "weather",
            priority: "warning",
            title: "Weather Risk",
            message: `Job "${job.title || job.address}" may be affected by weather. Consider rescheduling.`,
            action: {
              type: "reschedule",
              job_id: job.id,
            },
            metadata: alert.metadata,
          });
        }
      }
    }

    // Get scheduling conflicts (jobs scheduled on same day with same crew)
    const { data: scheduledJobs } = await supabase
      .from("roofing_jobs")
      .select(`
        id,
        title,
        scheduled_start_date,
        crew_id,
        crews:crew_id (
          id,
          name
        )
      `)
      .eq("workspace_id", workspaceId)
      .eq("status", "scheduled")
      .not("scheduled_start_date", "is", null)
      .not("crew_id", "is", null);

    // Group by date and crew to find conflicts
    const conflicts: any[] = [];
    if (scheduledJobs) {
      const byDateAndCrew: Record<string, any[]> = {};
      for (const job of scheduledJobs) {
        const date = (job as any).scheduled_start_date;
        const crewId = (job as any).crew_id;
        if (date && crewId) {
          const key = `${date}_${crewId}`;
          if (!byDateAndCrew[key]) {
            byDateAndCrew[key] = [];
          }
          byDateAndCrew[key].push(job);
        }
      }

      for (const [key, jobs] of Object.entries(byDateAndCrew)) {
        if (jobs.length > 1) {
          const crew = (jobs[0] as any).crews;
          conflicts.push({
            date: key.split("_")[0],
            crew: crew?.name,
            jobs: jobs.map((j: any) => ({ id: j.id, title: j.title })),
          });
        }
      }
    }

    if (conflicts.length > 0) {
      for (const conflict of conflicts) {
        recommendations.push({
          type: "scheduling",
          priority: "warning",
          title: "Scheduling Conflict",
          message: `Crew ${conflict.crew} is scheduled for ${conflicts.length} jobs on ${conflict.date}. Resolve conflict.`,
          action: {
            type: "resolve_conflict",
            date: conflict.date,
            crew: conflict.crew,
            jobs: conflict.jobs.map((j: any) => j.id),
          },
        });
      }
    }

    // Sort by priority (critical > high > warning > info)
    const priorityOrder = { critical: 0, high: 1, warning: 2, info: 3 };
    recommendations.sort((a, b) => {
      return (priorityOrder[a.priority as keyof typeof priorityOrder] || 3) -
             (priorityOrder[b.priority as keyof typeof priorityOrder] || 3);
    });

    return NextResponse.json({
      recommendations: recommendations.slice(0, 20), // Limit to top 20
      count: recommendations.length,
    });
  } catch (error: any) {
    console.error("Error in GET /api/production/ai/recommendations:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























