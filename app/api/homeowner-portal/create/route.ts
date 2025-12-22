// Block 83000 — SmartSend Roofing Homeowner Portal v1
// API Route: Create Portal for Job
// POST /api/homeowner-portal/create

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
    const { job_id, homeowner_email, homeowner_name } = body;

    if (!job_id) {
      return NextResponse.json(
        { error: "job_id is required" },
        { status: 400 }
      );
    }

    // Verify job exists and user has access
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select("id, workspace_id, homeowner_email, homeowner_name")
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

    // Check if portal already exists
    const { data: existingPortal } = await supabase
      .from("homeowner_portals")
      .select("id, portal_token")
      .eq("job_id", job_id)
      .eq("is_active", true)
      .single();

    if (existingPortal) {
      return NextResponse.json({
        portal: existingPortal,
        message: "Portal already exists",
      });
    }

    // Generate portal token
    const { data: tokenData, error: tokenError } = await supabase.rpc(
      "generate_portal_token"
    );

    if (tokenError) {
      // Fallback: generate token client-side style
      const fallbackToken = Math.random().toString(36).substring(2, 15) +
        Math.random().toString(36).substring(2, 15);
      
      // Create portal
      const { data: portal, error: portalError } = await supabase
        .from("homeowner_portals")
        .insert({
          workspace_id: job.workspace_id,
          job_id: job_id,
          portal_token: fallbackToken,
          homeowner_email: homeowner_email || job.homeowner_email,
          homeowner_name: homeowner_name || job.homeowner_name,
          is_active: true,
        })
        .select()
        .single();

      if (portalError) {
        console.error("Error creating portal:", portalError);
        return NextResponse.json(
          { error: portalError.message || "Failed to create portal" },
          { status: 500 }
        );
      }

      // Create initial event
      await supabase.from("homeowner_portal_events").insert({
        portal_id: portal.id,
        job_id: job_id,
        event_type: "status_update",
        title: "Job Portal Created",
        description: "Your project portal has been created. Track your roof project here.",
      });

      return NextResponse.json({ portal });
    }

    const portalToken = tokenData || Math.random().toString(36).substring(2, 15) +
      Math.random().toString(36).substring(2, 15);

    // Create portal
    const { data: portal, error: portalError } = await supabase
      .from("homeowner_portals")
      .insert({
        workspace_id: job.workspace_id,
        job_id: job_id,
        portal_token: portalToken,
        homeowner_email: homeowner_email || job.homeowner_email,
        homeowner_name: homeowner_name || job.homeowner_name,
        is_active: true,
      })
      .select()
      .single();

    if (portalError) {
      console.error("Error creating portal:", portalError);
      return NextResponse.json(
        { error: portalError.message || "Failed to create portal" },
        { status: 500 }
      );
    }

    // Create initial event
    await supabase.from("homeowner_portal_events").insert({
      portal_id: portal.id,
      job_id: job_id,
      event_type: "status_update",
      title: "Job Portal Created",
      description: "Your project portal has been created. Track your roof project here.",
    });

    return NextResponse.json({ portal }, { status: 201 });
  } catch (error: any) {
    console.error("Error creating portal:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



























