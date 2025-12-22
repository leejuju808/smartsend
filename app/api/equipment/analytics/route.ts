// Block 70000 — SmartSend Roofing Equipment Tracking + Fleet Maintenance System v1
// API Route: Get Equipment Analytics
// GET /api/equipment/analytics

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

    // Get analytics from view
    const { data: analytics, error: analyticsError } = await supabase
      .from("equipment_analytics")
      .select("*")
      .eq("workspace_id", workspaceMember.workspace_id);

    if (analyticsError) {
      console.error("Error fetching equipment analytics:", analyticsError);
      return NextResponse.json(
        { error: analyticsError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      analytics: analytics || [],
    });
  } catch (error: any) {
    console.error("Error in equipment analytics API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}




























