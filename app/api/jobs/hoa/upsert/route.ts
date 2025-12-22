// Block 22400 — SmartSend Roofing Permit & HOA Management v1
// API Route: Upsert HOA Request for a Job
// POST /api/jobs/hoa/upsert

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const body = await req.json();

    const {
      job_id,
      hoa_request_id,
      hoa_name,
      contact_email,
      contact_phone,
      status,
      submitted_date,
      approved_date,
      denied_date,
      notes,
    } = body;

    if (!job_id) {
      return NextResponse.json(
        { error: "Missing job_id" },
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
      .select("id, workspace_id")
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

    if (hoa_request_id) {
      // Update existing HOA request
      const { error: updateError } = await supabase
        .from("job_hoa_requests")
        .update({
          hoa_name,
          contact_email,
          contact_phone,
          status,
          submitted_date: submitted_date || null,
          approved_date: approved_date || null,
          denied_date: denied_date || null,
          notes,
          updated_at: new Date().toISOString(),
        })
        .eq("id", hoa_request_id);

      if (updateError) {
        console.error(updateError);
        return NextResponse.json(
          { error: updateError.message },
          { status: 500 }
        );
      }
    } else {
      // Insert new HOA request
      const { error: insertError } = await supabase
        .from("job_hoa_requests")
        .insert({
          job_id,
          workspace_id: job.workspace_id,
          hoa_name,
          contact_email,
          contact_phone,
          status,
          submitted_date: submitted_date || null,
          approved_date: approved_date || null,
          denied_date: denied_date || null,
          notes,
        });

      if (insertError) {
        console.error(insertError);
        return NextResponse.json(
          { error: insertError.message },
          { status: 500 }
        );
      }
    }

    // Sync summary (trigger should handle this, but call explicitly to be safe)
    await supabase.rpc("sync_job_hoa_summary", { p_job_id: job_id });

    return NextResponse.json(
      { success: true },
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error in HOA upsert:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}








































