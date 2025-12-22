import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { requireWorkspace } from "@/lib/workspace/withWorkspace";

/**
 * GET /api/scheduler/settings
 * Get availability settings for workspace
 */
export async function GET(req: NextRequest) {
  try {
    const gate = await requireWorkspace(req);
    if ("error" in gate) return gate.error;

    const { workspace_id } = gate;
    const supabase = getServerSupabase();

    const { data: settings, error } = await supabase
      .from("schedule_availability")
      .select("*")
      .eq("workspace_id", workspace_id)
      .single();

    if (error && error.code !== "PGRST116") {
      // PGRST116 = not found, which is OK for first-time setup
      console.error("Error fetching settings:", error);
      return NextResponse.json(
        { error: "Failed to fetch settings", details: error.message },
        { status: 500 }
      );
    }

    // If no settings exist, return defaults
    if (!settings) {
      return NextResponse.json({
        workspace_id,
        settings: null,
        defaults: {
          monday_enabled: true,
          tuesday_enabled: true,
          wednesday_enabled: true,
          thursday_enabled: true,
          friday_enabled: true,
          saturday_enabled: false,
          sunday_enabled: false,
          time_between_appointments: 30,
          max_appointments_per_day: 3,
          default_appointment_duration: 30,
        },
      });
    }

    return NextResponse.json({
      workspace_id,
      settings,
    });
  } catch (error: any) {
    console.error("Error in settings GET endpoint:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/scheduler/settings
 * Update availability settings
 * Body: Partial schedule_availability fields
 */
export async function POST(req: NextRequest) {
  try {
    const gate = await requireWorkspace(req);
    if ("error" in gate) return gate.error;

    const { workspace_id } = gate;
    const supabase = getServerSupabase();

    const body = await req.json();

    // Check if settings exist
    const { data: existing } = await supabase
      .from("schedule_availability")
      .select("id")
      .eq("workspace_id", workspace_id)
      .single();

    let result;
    if (existing) {
      // Update existing
      const { data, error } = await supabase
        .from("schedule_availability")
        .update({
          ...body,
          updated_at: new Date().toISOString(),
        })
        .eq("workspace_id", workspace_id)
        .select()
        .single();

      if (error) {
        console.error("Error updating settings:", error);
        return NextResponse.json(
          { error: "Failed to update settings", details: error.message },
          { status: 500 }
        );
      }

      result = data;
    } else {
      // Create new
      const { data, error } = await supabase
        .from("schedule_availability")
        .insert({
          workspace_id,
          ...body,
        })
        .select()
        .single();

      if (error) {
        console.error("Error creating settings:", error);
        return NextResponse.json(
          { error: "Failed to create settings", details: error.message },
          { status: 500 }
        );
      }

      result = data;
    }

    return NextResponse.json({
      success: true,
      settings: result,
    });
  } catch (error: any) {
    console.error("Error in settings POST endpoint:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}





















































