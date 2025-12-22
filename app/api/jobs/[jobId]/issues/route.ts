// Block 24380 — SmartSend Roofing Crew Assignment & Readiness v1
// API Route: Job Issues & Material Shortage Reports
// GET/POST /api/jobs/[jobId]/issues

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const supabase = createClient();
    const { jobId } = await params;

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
    const {
      issue_type,
      title,
      description,
      material_name,
      material_quantity_needed,
      material_notes,
      priority,
      reported_by,
    } = body;

    if (!issue_type || !title || !description) {
      return NextResponse.json(
        { error: "issue_type, title, and description are required" },
        { status: 400 }
      );
    }

    // Verify job exists and get crew assignment
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select(`
        workspace_id,
        job_crew_assignments!inner(
          crew_id,
          unassigned_at
        )
      `)
      .eq("id", jobId)
      .is("job_crew_assignments.unassigned_at", null)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: "Job not found or no crew assigned" },
        { status: 404 }
      );
    }

    const crewId = job.job_crew_assignments[0]?.crew_id;

    // Create issue
    const { data: issue, error: issueError } = await supabase
      .from("job_issues")
      .insert({
        job_id: jobId,
        workspace_id: job.workspace_id,
        crew_id: crewId,
        reported_by: reported_by || null,
        issue_type,
        title,
        description,
        material_name: material_name || null,
        material_quantity_needed: material_quantity_needed || null,
        material_notes: material_notes || null,
        priority: priority || "medium",
        status: "reported",
      })
      .select()
      .single();

    if (issueError) {
      console.error("Error creating issue:", issueError);
      return NextResponse.json(
        { error: issueError.message || "Failed to create issue" },
        { status: 500 }
      );
    }

    // Notify roofers about the issue
    const { data: members } = await supabase
      .from("workspace_members")
      .select("user_id")
      .eq("workspace_id", job.workspace_id)
      .in("role", ["owner", "admin"]);

    if (members) {
      for (const member of members) {
        await supabase.from("notifications").insert({
          user_id: member.user_id,
          workspace_id: job.workspace_id,
          type: "job_issue",
          title: `Job Issue: ${title}`,
          body: description.slice(0, 200),
          metadata: { job_id: jobId, issue_id: issue.id, priority },
        });
      }
    }

    // If material issue, trigger supplier communication (placeholder for future integration)
    if (issue_type === "material_shortage" || issue_type === "wrong_material") {
      // TODO: Integrate with supplier communication engine
      console.log("Material issue detected - would trigger supplier communication");
    }

    return NextResponse.json(
      { issue },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Error creating job issue:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const supabase = createClient();
    const { jobId } = await params;

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

    // Get issues for this job
    const { data: issues, error: issuesError } = await supabase
      .from("job_issues")
      .select(`
        *,
        crew:crews(
          id,
          name
        ),
        reported_by_member:crew_members!job_issues_reported_by_fkey(
          id,
          name
        )
      `)
      .eq("job_id", jobId)
      .order("created_at", { ascending: false });

    if (issuesError) {
      console.error("Error fetching issues:", issuesError);
      return NextResponse.json(
        { error: issuesError.message || "Failed to fetch issues" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { issues: issues || [] },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Error fetching job issues:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// PATCH: Update issue status
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const supabase = createClient();
    const { jobId } = await params;

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
    const { issue_id, status, resolution_notes } = body;

    if (!issue_id || !status) {
      return NextResponse.json(
        { error: "issue_id and status are required" },
        { status: 400 }
      );
    }

    const updates: any = { status };
    if (resolution_notes) updates.resolution_notes = resolution_notes;
    if (status === "resolved") {
      updates.resolved_at = new Date().toISOString();
      updates.resolved_by = user.id;
    }

    const { data: issue, error: updateError } = await supabase
      .from("job_issues")
      .update(updates)
      .eq("id", issue_id)
      .eq("job_id", jobId)
      .select()
      .single();

    if (updateError) {
      console.error("Error updating issue:", updateError);
      return NextResponse.json(
        { error: updateError.message || "Failed to update issue" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { issue },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Error updating issue:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}






































