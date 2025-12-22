// Block 227000 — SmartSend Roofing Customer Portal
// POST /api/customer/portal/create-access
// Creates a secure portal access token for a homeowner

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Verify authentication
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

    const { homeowner_id, job_id, expires_in_days } = await req.json();

    if (!homeowner_id || !job_id) {
      return NextResponse.json(
        { error: "homeowner_id and job_id are required" },
        { status: 400 }
      );
    }

    // Verify user has access to this job
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select("workspace_id")
      .eq("id", job_id)
      .single();

    if (jobError || !job) {
      // Try jobs table
      const { data: jobAlt, error: jobAltError } = await supabase
        .from("jobs")
        .select("workspace_id")
        .eq("id", job_id)
        .single();

      if (jobAltError || !jobAlt) {
        return NextResponse.json(
          { error: "Job not found" },
          { status: 404 }
        );
      }

      // Verify workspace access
      const { data: member } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", user.id)
        .eq("workspace_id", jobAlt.workspace_id)
        .single();

      if (!member) {
        return NextResponse.json(
          { error: "Access denied" },
          { status: 403 }
        );
      }
    } else {
      // Verify workspace access
      const { data: member } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", user.id)
        .eq("workspace_id", job.workspace_id)
        .single();

      if (!member) {
        return NextResponse.json(
          { error: "Access denied" },
          { status: 403 }
        );
      }
    }

    // Create portal access using function
    const { data: accessData, error: accessError } = await supabase.rpc(
      "create_customer_portal_access",
      {
        p_homeowner_id: homeowner_id,
        p_job_id: job_id,
        p_expires_in_days: expires_in_days || 365,
      }
    );

    if (accessError) {
      console.error("Error creating portal access:", accessError);
      return NextResponse.json(
        { error: "Failed to create portal access", details: accessError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      access_token: accessData.access_token,
      url: accessData.url,
      id: accessData.id,
    });
  } catch (error: any) {
    console.error("Error in create-access API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























