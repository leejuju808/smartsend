/**
 * Process Storm Event
 * POST /api/storm/events/[eventId]/process
 * Processes a storm event: finds affected leads, applies boosts, tags threads
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspaceId } from "@/lib/workspaces/server";

export async function POST(
  req: NextRequest,
  { params }: { params: { eventId: string } }
) {
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

    const eventId = params.eventId;

    // Verify storm event exists and belongs to workspace
    const { data: stormEvent, error: eventError } = await supabase
      .from("storm_events")
      .select("id, workspace_id")
      .eq("id", eventId)
      .eq("workspace_id", workspaceId)
      .single();

    if (eventError || !stormEvent) {
      return NextResponse.json(
        { error: "Storm event not found" },
        { status: 404 }
      );
    }

    // Process the storm event
    const { data: result, error } = await supabase.rpc("process_storm_event", {
      p_storm_event_id: eventId,
    });

    if (error) {
      console.error("Error processing storm event:", error);
      return NextResponse.json(
        { error: "Failed to process storm event" },
        { status: 500 }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error in /api/storm/events/[eventId]/process:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}



















































