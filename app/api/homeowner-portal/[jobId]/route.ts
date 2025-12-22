// Block 83000 — SmartSend Roofing Homeowner Portal v1
// API Route: Get/Update Portal for Job
// GET /api/homeowner-portal/[jobId]
// PUT /api/homeowner-portal/[jobId]

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

    // Verify job exists and user has access
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select("id, workspace_id")
      .eq("id", jobId)
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

    // Get portal
    const { data: portal, error: portalError } = await supabase
      .from("homeowner_portals")
      .select("*")
      .eq("job_id", jobId)
      .eq("is_active", true)
      .single();

    if (portalError || !portal) {
      return NextResponse.json(
        { error: "Portal not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ portal });
  } catch (error: any) {
    console.error("Error fetching portal:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(
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
    const { is_active, homeowner_email, homeowner_name } = body;

    // Verify job exists and user has access
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select("id, workspace_id")
      .eq("id", jobId)
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

    // Update portal
    const updateData: any = {};
    if (is_active !== undefined) updateData.is_active = is_active;
    if (homeowner_email !== undefined) updateData.homeowner_email = homeowner_email;
    if (homeowner_name !== undefined) updateData.homeowner_name = homeowner_name;

    const { data: portal, error: portalError } = await supabase
      .from("homeowner_portals")
      .update(updateData)
      .eq("job_id", jobId)
      .select()
      .single();

    if (portalError) {
      console.error("Error updating portal:", portalError);
      return NextResponse.json(
        { error: portalError.message || "Failed to update portal" },
        { status: 500 }
      );
    }

    return NextResponse.json({ portal });
  } catch (error: any) {
    console.error("Error updating portal:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



























