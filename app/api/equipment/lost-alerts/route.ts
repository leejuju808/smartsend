// Block 70000 — SmartSend Roofing Equipment Tracking + Fleet Maintenance System v1
// API Route: Get Lost Equipment Alerts
// GET /api/equipment/lost-alerts

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
    const hours_threshold = parseInt(searchParams.get("hours_threshold") || "24");

    // Call the database function
    const { data: lostEquipment, error: lostError } = await supabase.rpc(
      "detect_lost_equipment",
      {
        p_workspace_id: workspaceMember.workspace_id,
        p_hours_threshold: hours_threshold,
      }
    );

    if (lostError) {
      console.error("Error detecting lost equipment:", lostError);
      return NextResponse.json(
        { error: lostError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      lost_equipment: lostEquipment || [],
    });
  } catch (error: any) {
    console.error("Error in lost equipment alerts API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}




























