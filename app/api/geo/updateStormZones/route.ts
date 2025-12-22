/**
 * POST /api/geo/updateStormZones
 * Block 18000 — Update storm opportunity zones
 * Worker function to create/update storm zones from weather events
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get workspace_id and weather_event_id from request
    const body = await req.json().catch(() => ({}));
    const workspaceId = body.workspace_id || req.nextUrl.searchParams.get("workspace_id");
    const weatherEventId = body.weather_event_id || req.nextUrl.searchParams.get("weather_event_id");

    if (weatherEventId && workspaceId) {
      // Update storm zones for a specific weather event
      const { error } = await supabase.rpc("update_storm_zones_from_weather", {
        p_workspace_id: workspaceId,
        p_weather_event_id: weatherEventId,
      });

      if (error) {
        console.error("Error updating storm zones:", error);
        return NextResponse.json(
          { error: error.message },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        message: "Storm zones updated successfully",
        workspace_id: workspaceId,
        weather_event_id: weatherEventId,
      });
    } else if (workspaceId) {
      // Update storm zones for all recent weather events in a workspace
      const { data: weatherEvents } = await supabase
        .from("weather_events")
        .select("id")
        .eq("workspace_id", workspaceId)
        .gte("storm_started_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()); // Last 30 days

      if (!weatherEvents || weatherEvents.length === 0) {
        return NextResponse.json({
          success: true,
          message: "No recent weather events found",
          updated: 0,
        });
      }

      let updated = 0;
      for (const event of weatherEvents) {
        const { error } = await supabase.rpc("update_storm_zones_from_weather", {
          p_workspace_id: workspaceId,
          p_weather_event_id: event.id,
        });

        if (!error) {
          updated++;
        } else {
          console.error(`Error updating storm zones for event ${event.id}:`, error);
        }
      }

      return NextResponse.json({
        success: true,
        message: "Storm zones updated for recent weather events",
        updated,
        total: weatherEvents.length,
      });
    } else {
      return NextResponse.json(
        { error: "workspace_id is required" },
        { status: 400 }
      );
    }
  } catch (error: any) {
    console.error("Error in POST /api/geo/updateStormZones:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





















































