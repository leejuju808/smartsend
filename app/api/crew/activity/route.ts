// Block 42000 — SmartSend Roofing Crew App v1
// API Route: Get Job Activity Feed
// GET /api/crew/activity?job_id=xxx

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    
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

    const { searchParams } = new URL(req.url);
    const job_id = searchParams.get("job_id");
    const limit = parseInt(searchParams.get("limit") || "50");

    if (!job_id) {
      return NextResponse.json(
        { error: "job_id is required" },
        { status: 400 }
      );
    }

    const { data: activities, error } = await supabase
      .from("job_activity_log")
      .select(`
        *,
        crew_members (
          id,
          name,
          role
        )
      `)
      .eq("job_id", job_id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("Error fetching activity:", error);
      return NextResponse.json(
        { error: "Failed to fetch activity" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      activities: activities || [],
    });
  } catch (error: any) {
    console.error("Error in get activity API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}































