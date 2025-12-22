// Block 34044 — Assign Crew to Job
// POST: Assign a crew to a job

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json();
    const { crew_id, is_primary = true, notes } = body;

    if (!crew_id) {
      return NextResponse.json(
        { error: "crew_id is required" },
        { status: 400 }
      );
    }

    // Verify job exists
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("id, team_id")
      .eq("id", params.id)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // If this is a primary assignment, remove existing primary
    if (is_primary) {
      await supabase
        .from("job_crews")
        .update({ is_primary: false })
        .eq("job_id", params.id)
        .eq("is_primary", true);
    }

    // Create assignment
    const { data: assignment, error } = await supabase
      .from("job_crews")
      .insert({
        job_id: params.id,
        crew_id,
        is_primary,
        assigned_by: user.id,
        notes,
      })
      .select(`
        *,
        crews (
          id,
          name,
          leader_phone,
          foreman_phone,
          skills
        )
      `)
      .single();

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({ assignment }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Unknown error" },
      { status: 500 }
    );
  }
}

































