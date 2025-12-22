// Block 254000 — SmartSend Productivity Engine v1
// API Route: Get Productivity Bottlenecks
// GET /api/productivity/bottlenecks?workspace_id=xxx&resolved=false&severity=high

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();

    // Authenticate
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const workspace_id = searchParams.get("workspace_id");
    const resolved = searchParams.get("resolved") === "true";
    const severity = searchParams.get("severity");

    if (!workspace_id) {
      return NextResponse.json(
        { error: "workspace_id required" },
        { status: 400 }
      );
    }

    // Verify workspace access
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Build query
    let query = supabase
      .from("productivity_bottlenecks")
      .select(
        `
        id,
        job_id,
        crew_id,
        bottleneck_type,
        severity,
        description,
        estimated_delay_minutes,
        cost_impact,
        detected_at,
        resolved,
        resolved_at,
        resolution_notes
      `
      )
      .eq("workspace_id", workspace_id)
      .eq("resolved", resolved)
      .order("detected_at", { ascending: false });

    if (severity) {
      query = query.eq("severity", severity);
    }

    const { data: bottlenecks, error: bottlenecksError } = await query;

    if (bottlenecksError) {
      console.error("Error fetching bottlenecks:", bottlenecksError);
      return NextResponse.json(
        { error: "Failed to fetch bottlenecks" },
        { status: 500 }
      );
    }

    // Get crew names
    const crewIds = bottlenecks
      ?.map((b) => b.crew_id)
      .filter((id): id is string => id !== null) || [];

    let crewMap: Record<string, string> = {};
    if (crewIds.length > 0) {
      const { data: crews } = await supabase
        .from("crews")
        .select("id, name")
        .in("id", crewIds);

      crewMap = (crews || []).reduce(
        (acc, crew) => {
          acc[crew.id] = crew.name;
          return acc;
        },
        {} as Record<string, string>
      );
    }

    // Get job titles
    const jobIds = bottlenecks
      ?.map((b) => b.job_id)
      .filter((id): id is string => id !== null) || [];

    let jobMap: Record<string, string> = {};
    if (jobIds.length > 0) {
      // Try both jobs tables
      const { data: jobs1 } = await supabase
        .from("jobs")
        .select("id, title")
        .in("id", jobIds);

      const { data: jobs2 } = await supabase
        .from("roofing_jobs")
        .select("id, title")
        .in("id", jobIds);

      const allJobs = [...(jobs1 || []), ...(jobs2 || [])];
      jobMap = allJobs.reduce(
        (acc, job) => {
          acc[job.id] = job.title || `Job ${job.id.substring(0, 8)}`;
          return acc;
        },
        {} as Record<string, string>
      );
    }

    const enrichedBottlenecks = (bottlenecks || []).map((bottleneck) => ({
      ...bottleneck,
      crew_name: bottleneck.crew_id
        ? crewMap[bottleneck.crew_id] || "Unknown Crew"
        : null,
      job_title: bottleneck.job_id
        ? jobMap[bottleneck.job_id] || `Job ${bottleneck.job_id.substring(0, 8)}`
        : null,
    }));

    return NextResponse.json({
      success: true,
      bottlenecks: enrichedBottlenecks,
      count: enrichedBottlenecks.length,
      filters: {
        resolved,
        severity: severity || null,
      },
    });
  } catch (error: any) {
    console.error("Error in bottlenecks route:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// POST: Resolve a bottleneck
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();

    // Authenticate
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { bottleneck_id, resolution_notes } = body;

    if (!bottleneck_id) {
      return NextResponse.json(
        { error: "bottleneck_id required" },
        { status: 400 }
      );
    }

    // Update bottleneck
    const { data: updated, error: updateError } = await supabase
      .from("productivity_bottlenecks")
      .update({
        resolved: true,
        resolved_at: new Date().toISOString(),
        resolution_notes: resolution_notes || null,
      })
      .eq("id", bottleneck_id)
      .select()
      .single();

    if (updateError) {
      console.error("Error resolving bottleneck:", updateError);
      return NextResponse.json(
        { error: "Failed to resolve bottleneck" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      bottleneck: updated,
    });
  } catch (error: any) {
    console.error("Error in resolve bottleneck route:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}























