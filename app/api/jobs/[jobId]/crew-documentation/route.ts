// Block 25540 — SmartSend Roofing Warranty & Document Vault v1
// API Route: Crew Documentation Requirements
// GET/POST /api/jobs/[jobId]/crew-documentation

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET: Get crew documentation requirements status
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
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get job and verify access
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select("id, workspace_id")
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
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

    // Get crew documentation requirements
    const { data: requirements, error: requirementsError } = await supabase
      .from("crew_documentation_requirements")
      .select("*")
      .eq("job_id", jobId)
      .single();

    if (requirementsError && requirementsError.code !== "PGRST116") {
      console.error("Error fetching requirements:", requirementsError);
      return NextResponse.json(
        { error: requirementsError.message || "Failed to fetch requirements" },
        { status: 500 }
      );
    }

    // Check if all requirements are met
    const { data: allMet, error: checkError } = await supabase.rpc(
      "check_crew_documentation_requirements",
      { p_job_id: jobId }
    );

    if (checkError) {
      console.error("Error checking requirements:", checkError);
      // Don't fail, just log
    }

    return NextResponse.json({
      requirements: requirements || null,
      allRequirementsMet: allMet || false,
    });
  } catch (error: any) {
    console.error("Error in GET crew-documentation:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// POST: Update crew documentation requirements
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const supabase = createClient();
    const { jobId } = await params;
    const body = await req.json();

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
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
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

    // Upsert requirements
    const { data: requirements, error: upsertError } = await supabase
      .from("crew_documentation_requirements")
      .upsert(
        {
          job_id: jobId,
          workspace_id: job.workspace_id,
          requires_underlayment_photos:
            body.requires_underlayment_photos ?? true,
          requires_decking_photos: body.requires_decking_photos ?? true,
          requires_flashing_photos: body.requires_flashing_photos ?? true,
          requires_vent_installation_photos:
            body.requires_vent_installation_photos ?? true,
          requires_final_cleanup_photos:
            body.requires_final_cleanup_photos ?? true,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "job_id",
        }
      )
      .select()
      .single();

    if (upsertError) {
      console.error("Error upserting requirements:", upsertError);
      return NextResponse.json(
        { error: upsertError.message || "Failed to update requirements" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      requirements,
    });
  } catch (error: any) {
    console.error("Error in POST crew-documentation:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}




































