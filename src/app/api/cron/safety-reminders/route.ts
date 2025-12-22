// Block 71000 — SmartSend Roofing Safety Compliance Reminders
// Cron Job: Process Safety Reminders
// Runs daily at 7 AM to send toolbox talk reminders and check certifications

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createServiceClient();
    const today = new Date().toISOString().split("T")[0];
    const results = {
      toolboxTalksReminded: 0,
      certificationsReminded: 0,
      errors: [] as string[],
    };

    // 1. Daily Toolbox Talk Reminders (7 AM)
    // Find workspaces that haven't done a toolbox talk today
    // First, get all workspaces with toolbox talks today
    const { data: talksToday } = await supabase
      .from("toolbox_talks")
      .select("workspace_id")
      .eq("date", today);

    const workspaceIdsWithTalk = new Set(
      talksToday?.map((t) => t.workspace_id) || []
    );

    // Get all workspaces and filter out those with talks
    const { data: allWorkspaces, error: workspacesError } = await supabase
      .from("workspaces")
      .select("id, name");

    const workspacesWithoutTalk =
      allWorkspaces?.filter((w) => !workspaceIdsWithTalk.has(w.id)) || [];

    if (workspacesError) {
      results.errors.push(`Error fetching workspaces: ${workspacesError.message}`);
    } else if (workspacesWithoutTalk) {
      // Get active jobs for each workspace to suggest a topic
      for (const workspace of workspacesWithoutTalk) {
        const { data: activeJobs } = await supabase
          .from("roofing_jobs")
          .select("id, title")
          .eq("workspace_id", workspace.id)
          .in("status", ["scheduled", "in_progress"])
          .limit(1);

        const jobInfo = activeJobs?.[0]
          ? ` for Job #${activeJobs[0].id} — ${activeJobs[0].title}`
          : "";

        // In a real implementation, you'd send an email/notification here
        // For now, we'll just log it
        console.log(
          `[Safety Reminder] Workspace ${workspace.name}: Don't forget your daily Toolbox Talk${jobInfo} — heat exhaustion is today's recommended topic.`
        );
        results.toolboxTalksReminded++;
      }
    }

    // 2. Certification Expiration Reminders
    // Check certifications expiring in 30, 7, and 1 days
    const reminderDays = [30, 7, 1];
    for (const daysAhead of reminderDays) {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + daysAhead);
      const futureDateStr = futureDate.toISOString().split("T")[0];

      const { data: expiringCerts, error: certsError } = await supabase
        .from("certifications")
        .select(`
          id,
          user_id,
          type,
          expiration_date,
          workspace_id,
          workspaces(name)
        `)
        .eq("expiration_date", futureDateStr);

      // Fetch user profiles separately
      if (expiringCerts) {
        const userIds = [...new Set(expiringCerts.map((c) => c.user_id))];
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, email, first_name, last_name")
          .in("id", userIds);

        const profilesMap = new Map(
          profiles?.map((p) => [p.id, p]) || []
        );

        // Add profile info to each cert
        for (const cert of expiringCerts) {
          const profile = profilesMap.get(cert.user_id);
          (cert as any).profile = profile;
        }
      }

      if (certsError) {
        results.errors.push(`Error fetching certifications: ${certsError.message}`);
      } else if (expiringCerts) {
        for (const cert of expiringCerts) {
          const profile = (cert as any).profile;
          const userName =
            profile?.first_name && profile?.last_name
              ? `${profile.first_name} ${profile.last_name}`
              : profile?.email || "Crew member";

          // In a real implementation, you'd send an email/notification here
          console.log(
            `[Certification Reminder] ${userName}'s '${cert.type}' certification expires in ${daysAhead} day(s) (${cert.expiration_date}). Workspace: ${(cert.workspaces as any)?.name || "Unknown"}`
          );
          results.certificationsReminded++;
        }
      }
    }

    return NextResponse.json({
      success: true,
      processed: results.toolboxTalksReminded + results.certificationsReminded,
      toolboxTalksReminded: results.toolboxTalksReminded,
      certificationsReminded: results.certificationsReminded,
      errors: results.errors,
    });
  } catch (error: any) {
    console.error("Error in safety reminders cron:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// GET endpoint for manual testing
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get("key");

  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Call POST handler
  return POST(req);
}



























