// Block 70000 — SmartSend Roofing Equipment Tracking + Fleet Maintenance System v1
// API Route: List Equipment
// GET /api/equipment/list

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

    // Get workspace_id
    const { data: workspaceMember } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .limit(1)
      .single();

    if (!workspaceMember) {
      return NextResponse.json(
        { error: "No workspace found" },
        { status: 404 }
      );
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const type = searchParams.get("type");
    const crew_id = searchParams.get("crew_id");

    // Build query
    let query = supabase
      .from("equipment")
      .select(`
        *,
        assigned_crew:crews(id, name),
        assigned_crew_member:crew_members(id, name),
        last_known_job:roofing_jobs(id, title)
      `)
      .eq("workspace_id", workspaceMember.workspace_id)
      .order("created_at", { ascending: false });

    if (status) {
      query = query.eq("status", status);
    }

    if (type) {
      query = query.eq("type", type);
    }

    if (crew_id) {
      query = query.eq("assigned_crew_id", crew_id);
    }

    const { data: equipment, error: equipmentError } = await query;

    if (equipmentError) {
      console.error("Error fetching equipment:", equipmentError);
      return NextResponse.json(
        { error: equipmentError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      equipment,
    });
  } catch (error: any) {
    console.error("Error in equipment list API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}




























