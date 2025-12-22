// Block 25500 — SmartSend Roofing Payroll & Crew Pay v1
// API Route: Crew Pay Management
// GET /api/crew/pay?job_id=xxx&crew_id=xxx
// POST /api/crew/pay (calculate pay)
// PATCH /api/crew/pay/[id] (update pay entry)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET: Get crew pay entries
export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();

    // Ensure user is authenticated
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

    const url = new URL(req.url);
    const jobId = url.searchParams.get("job_id");
    const crewId = url.searchParams.get("crew_id");
    const workspaceId = url.searchParams.get("workspace_id");
    const status = url.searchParams.get("status");

    // Build query
    let query = supabase
      .from("crew_pay_entries")
      .select(`
        *,
        job:roofing_jobs(id, title, job_value, status),
        crew:crews(id, name),
        bonuses:crew_bonuses(*),
        penalties:crew_penalties(*)
      `);

    if (jobId) {
      query = query.eq("job_id", jobId);
    }
    if (crewId) {
      query = query.eq("crew_id", crewId);
    }
    if (workspaceId) {
      query = query.eq("workspace_id", workspaceId);
    }
    if (status) {
      query = query.eq("status", status);
    }

    query = query.order("created_at", { ascending: false });

    const { data: payEntries, error: payError } = await query;

    if (payError) {
      console.error("Error fetching pay entries:", payError);
      return NextResponse.json(
        { error: payError.message || "Failed to fetch pay entries" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { pay_entries: payEntries || [] },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Error in crew pay GET API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// POST: Calculate crew pay for a job
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();

    // Ensure user is authenticated
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
    const { job_id, crew_id } = body;

    if (!job_id || !crew_id) {
      return NextResponse.json(
        { error: "job_id and crew_id are required" },
        { status: 400 }
      );
    }

    // Verify job exists and user has access
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select("workspace_id")
      .eq("id", job_id)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Verify user has access to workspace
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", job.workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    // Calculate pay entry
    const { data: payEntryId, error: calcError } = await supabase.rpc(
      "calculate_crew_pay_entry",
      {
        p_job_id: job_id,
        p_crew_id: crew_id,
      }
    );

    if (calcError) {
      console.error("Error calculating pay entry:", calcError);
      return NextResponse.json(
        { error: calcError.message || "Failed to calculate pay entry" },
        { status: 500 }
      );
    }

    // Get the created/updated pay entry
    const { data: payEntry, error: fetchError } = await supabase
      .from("crew_pay_entries")
      .select(`
        *,
        job:roofing_jobs(id, title, job_value),
        crew:crews(id, name),
        bonuses:crew_bonuses(*),
        penalties:crew_penalties(*)
      `)
      .eq("id", payEntryId)
      .single();

    if (fetchError) {
      console.error("Error fetching pay entry:", fetchError);
      return NextResponse.json(
        { error: fetchError.message || "Failed to fetch pay entry" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { pay_entry: payEntry },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Error in crew pay POST API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}




































