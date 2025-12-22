/**
 * Storm Events API
 * GET /api/storm/events - List storm events for workspace
 * POST /api/storm/events - Create/ingest a new storm event
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspaceId } from "@/lib/workspaces/server";

/**
 * GET /api/storm/events
 * List storm events for the active workspace
 * Query params: processed, event_type, zip, limit, offset
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const workspaceId = await getActiveWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    const { searchParams } = new URL(req.url);
    const processed = searchParams.get("processed");
    const eventType = searchParams.get("event_type");
    const zip = searchParams.get("zip");
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");

    let query = supabase
      .from("storm_events")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("event_started_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (processed !== null) {
      query = query.eq("processed", processed === "true");
    }

    if (eventType) {
      query = query.eq("event_type", eventType);
    }

    if (zip) {
      query = query.eq("affected_zip", zip);
    }

    const { data: events, error } = await query;

    if (error) {
      console.error("Error fetching storm events:", error);
      return NextResponse.json(
        { error: "Failed to fetch storm events" },
        { status: 500 }
      );
    }

    return NextResponse.json({ events: events || [] });
  } catch (error) {
    console.error("Error in /api/storm/events GET:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/storm/events
 * Create/ingest a new storm event
 * Body: { event_type, intensity, affected_zip, event_started_at, ... }
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const workspaceId = await getActiveWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    const body = await req.json();
    const {
      event_type,
      intensity,
      affected_zip,
      affected_city,
      affected_state,
      affected_county,
      event_started_at,
      event_ended_at,
      hail_size_inches,
      hail_size_category,
      wind_speed_mph,
      wind_gust_mph,
      rainfall_inches,
      source = "manual",
      source_id,
      metadata = {},
    } = body;

    // Validation
    if (!event_type || !affected_zip || !event_started_at) {
      return NextResponse.json(
        { error: "Missing required fields: event_type, affected_zip, event_started_at" },
        { status: 400 }
      );
    }

    // Insert storm event
    const { data: stormEvent, error } = await supabase
      .from("storm_events")
      .insert({
        workspace_id: workspaceId,
        event_type,
        intensity,
        affected_zip,
        affected_city,
        affected_state,
        affected_county,
        event_started_at,
        event_ended_at,
        hail_size_inches,
        hail_size_category,
        wind_speed_mph,
        wind_gust_mph,
        rainfall_inches,
        source,
        source_id,
        metadata,
        processed: false,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating storm event:", error);
      return NextResponse.json(
        { error: "Failed to create storm event" },
        { status: 500 }
      );
    }

    // Optionally auto-process the event
    const autoProcess = body.auto_process === true;
    if (autoProcess && stormEvent) {
      // Process in background (don't wait)
      supabase.rpc("process_storm_event", { p_storm_event_id: stormEvent.id })
        .then(() => {
          console.log(`Processed storm event ${stormEvent.id}`);
        })
        .catch((err) => {
          console.error(`Error processing storm event ${stormEvent.id}:`, err);
        });
    }

    return NextResponse.json({ event: stormEvent }, { status: 201 });
  } catch (error) {
    console.error("Error in /api/storm/events POST:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}



















































