// Block 22360 — SmartSend Roofing Warranty & Service Tracking v1
// API Route: Set Warranties for a Job
// POST /api/jobs/set-warranties

import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const body = await req.json();

    const { job_id, warranties } = body;

    if (!job_id || !Array.isArray(warranties)) {
      return NextResponse.json(
        { error: "Missing job_id or warranties" },
        { status: 400 }
      );
    }

    // Ensure user is authenticated
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get job and verify access
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select("id, workspace_id, scheduled_end_date")
      .eq("id", job_id)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Verify user has access to this workspace
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", job.workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const startDate = job.scheduled_end_date || new Date().toISOString().slice(0, 10);

    // Simple v1: delete existing and recreate
    await supabase.from("job_warranties").delete().eq("job_id", job_id);

    const rows = warranties.map((w: any) => {
      const durationYears = w.duration_years || 0;
      const start = w.start_date || startDate;
      const end =
        w.end_date ||
        (durationYears
          ? new Date(
              new Date(start).setFullYear(
                new Date(start).getFullYear() + durationYears
              )
            )
              .toISOString()
              .slice(0, 10)
          : null);

      return {
        job_id,
        workspace_id: job.workspace_id,
        policy_id: w.policy_id || null,
        type: w.type,
        provider_name: w.provider_name || null,
        warranty_number: w.warranty_number || null,
        duration_years: durationYears,
        start_date: start,
        end_date: end,
        notes: w.notes || null,
      };
    });

    if (rows.length > 0) {
      const { error: insertError } = await supabase
        .from("job_warranties")
        .insert(rows);

      if (insertError) {
        console.error(insertError);
        return NextResponse.json(
          { error: insertError.message },
          { status: 500 }
        );
      }
    }

    // sync summary (trigger should handle this, but call explicitly to be sure)
    const { error: syncError } = await supabase.rpc("sync_job_warranty_summary", {
      p_job_id: job_id,
    });

    if (syncError) {
      console.error("Sync error:", syncError);
      // Don't fail the request, just log it
    }

    return NextResponse.json(
      { success: true },
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error in set-warranties:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}








































