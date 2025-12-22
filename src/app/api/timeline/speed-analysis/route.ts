// Block 64000 — Production Timeline Optimizer
// POST /api/timeline/speed-analysis
// Calculates real-time crew efficiency

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json();
    const { crew_id, job_id } = body;

    if (!crew_id || !job_id) {
      return NextResponse.json(
        { error: "crew_id and job_id are required" },
        { status: 400 }
      );
    }

    // Verify access
    const { data: job } = await supabase
      .from("roofing_jobs")
      .select("workspace_id")
      .eq("id", job_id)
      .single();

    if (!job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    const { data: member } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", job.workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!member) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    // Calculate crew efficiency
    const { data: efficiencyPercent, error: calcError } = await supabase.rpc(
      "calculate_crew_efficiency",
      {
        p_crew_id: crew_id,
        p_job_id: job_id
      }
    );

    if (calcError) {
      console.error("Error calculating efficiency:", calcError);
      return NextResponse.json(
        { error: "Failed to calculate efficiency", details: calcError.message },
        { status: 500 }
      );
    }

    // Get efficiency record
    const { data: efficiency, error: fetchError } = await supabase
      .from("crew_efficiency")
      .select("*")
      .eq("crew_id", crew_id)
      .eq("job_id", job_id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      console.error("Error fetching efficiency:", fetchError);
    }

    return NextResponse.json({
      success: true,
      efficiency_percent: efficiencyPercent || 100,
      efficiency: efficiency || null
    });
  } catch (error: any) {
    console.error("Error in /api/timeline/speed-analysis:", error);
    return NextResponse.json(
      { error: error.message || "Unknown error" },
      { status: 500 }
    );
  }
}

// GET /api/timeline/speed-analysis?crew_id=xxx&job_id=xxx
// Get crew efficiency for a job
export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const crew_id = searchParams.get("crew_id");
    const job_id = searchParams.get("job_id");
    const workspace_id = searchParams.get("workspace_id");

    if (!crew_id && !job_id && !workspace_id) {
      return NextResponse.json(
        { error: "At least one of crew_id, job_id, or workspace_id is required" },
        { status: 400 }
      );
    }

    // Get user's workspace if not provided
    let userWorkspaceId = workspace_id;
    if (!userWorkspaceId) {
      const { data: member } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", user.id)
        .limit(1)
        .single();
      
      userWorkspaceId = member?.workspace_id || null;
    }

    // Build query
    let query = supabase
      .from("crew_efficiency")
      .select(`
        *,
        crews(id, name),
        roofing_jobs!inner(id, title)
      `)
      .order("updated_at", { ascending: false });

    if (crew_id) {
      query = query.eq("crew_id", crew_id);
    }
    if (job_id) {
      query = query.eq("job_id", job_id);
    }
    if (userWorkspaceId) {
      query = query.eq("workspace_id", userWorkspaceId);
    }

    const { data: efficiencies, error } = await query.limit(100);

    if (error) {
      console.error("Error fetching efficiencies:", error);
      return NextResponse.json(
        { error: "Failed to fetch efficiencies", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      efficiencies: efficiencies || []
    });
  } catch (error: any) {
    console.error("Error in GET /api/timeline/speed-analysis:", error);
    return NextResponse.json(
      { error: error.message || "Unknown error" },
      { status: 500 }
    );
  }
}




























