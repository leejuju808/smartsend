// Block 42000 — SmartSend Roofing Crew App v1
// API Route: Punch List CRUD
// GET /api/crew/punch-list?job_id=xxx
// POST /api/crew/punch-list
// PATCH /api/crew/punch-list/[id]

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

    if (!job_id) {
      return NextResponse.json(
        { error: "job_id is required" },
        { status: 400 }
      );
    }

    const { data: punchList, error } = await supabase
      .from("punch_list")
      .select("*")
      .eq("job_id", job_id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching punch list:", error);
      return NextResponse.json(
        { error: "Failed to fetch punch list" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      punch_list: punchList || [],
    });
  } catch (error: any) {
    console.error("Error in get punch list API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
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

    const body = await req.json();
    const { job_id, description, status } = body;

    if (!job_id || !description) {
      return NextResponse.json(
        { error: "job_id and description are required" },
        { status: 400 }
      );
    }

    const { data: punchItem, error } = await supabase
      .from("punch_list")
      .insert({
        job_id,
        description,
        status: status || "pending",
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating punch item:", error);
      return NextResponse.json(
        { error: "Failed to create punch item" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      punch_item: punchItem,
    });
  } catch (error: any) {
    console.error("Error in create punch item API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}































