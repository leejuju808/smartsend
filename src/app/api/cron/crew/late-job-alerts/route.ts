// Block 225000 — SmartSend Roofing Crew App v1
// Cron job: Check for jobs that haven't started by 9 AM
// Sends alerts to office

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    // Verify this is a cron request (add auth header check in production)
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const today = new Date().toISOString().split("T")[0];
    const currentHour = new Date().getHours();

    // Only run if it's 9 AM or later
    if (currentHour < 9) {
      return NextResponse.json({
        message: "Too early - alerts only sent after 9 AM",
      });
    }

    // Find jobs scheduled for today that haven't started
    const { data: jobs, error: jobsError } = await supabase
      .from("jobs")
      .select(`
        id,
        address,
        crew_id,
        production_date,
        stage,
        crews!inner(id, name, foreman_phone, workspace_id)
      `)
      .eq("production_date", today)
      .eq("stage", "scheduled")
      .not("crew_id", "is", null);

    if (jobsError) {
      console.error("Error fetching jobs:", jobsError);
      return NextResponse.json(
        { error: "Failed to fetch jobs" },
        { status: 500 }
      );
    }

    // Also check roofing_jobs
    const { data: roofingJobs } = await supabase
      .from("roofing_jobs")
      .select(`
        id,
        address,
        crew_id,
        scheduled_start_date,
        status,
        crews!inner(id, name, foreman_phone, workspace_id)
      `)
      .eq("scheduled_start_date", today)
      .eq("status", "scheduled")
      .not("crew_id", "is", null);

    const allJobs = [...(jobs || []), ...(roofingJobs || [])];

    // Check which jobs have daily logs started
    const jobIds = allJobs.map((j) => j.id);
    const { data: dailyLogs } = await supabase
      .from("crew_daily_logs")
      .select("job_id, status")
      .in("job_id", jobIds)
      .eq("date", today)
      .eq("status", "in_progress");

    const startedJobIds = new Set(dailyLogs?.map((log) => log.job_id) || []);

    // Find jobs that haven't started
    const lateJobs = allJobs.filter((job) => !startedJobIds.has(job.id));

    if (lateJobs.length === 0) {
      return NextResponse.json({
        message: "All jobs started on time",
        checked: allJobs.length,
      });
    }

    // Send notifications for each late job
    const notifications = [];

    for (const job of lateJobs) {
      const workspaceId = job.crews?.workspace_id || job.workspace_id;

      if (!workspaceId) continue;

      // Get workspace members (owners/managers)
      const { data: members } = await supabase
        .from("workspace_members")
        .select("user_id, users!inner(email)")
        .eq("workspace_id", workspaceId);

      if (!members) continue;

      // Create notifications
      for (const member of members) {
        // Create in-app notification
        await supabase.from("notifications").insert({
          user_id: member.user_id,
          workspace_id: workspaceId,
          type: "crew_job_late_start",
          title: `Crew has not started Job #${job.id.slice(0, 8)}`,
          body: `Crew ${job.crews?.name || "Unknown"} has not started job at ${job.address || "Unknown address"} by 9 AM.`,
          payload: {
            job_id: job.id,
            crew_id: job.crew_id,
            address: job.address,
            crew_name: job.crews?.name,
          },
          is_read: false,
        });

        notifications.push({
          job_id: job.id,
          user_id: member.user_id,
          crew_name: job.crews?.name,
        });
      }
    }

    return NextResponse.json({
      success: true,
      lateJobsCount: lateJobs.length,
      notificationsSent: notifications.length,
      lateJobs: lateJobs.map((j) => ({
        job_id: j.id,
        address: j.address,
        crew_name: j.crews?.name,
      })),
    });
  } catch (error: any) {
    console.error("Late job alerts error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























