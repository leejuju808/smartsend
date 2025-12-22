import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { requireWorkspace } from "@/lib/workspace/withWorkspace";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * POST /api/scheduler/travelTime
 * Calculate travel time between two addresses
 * Body:
 * {
 *   from_address: string (required)
 *   to_address: string (required)
 *   departure_time?: ISO string (optional, for traffic-aware routing)
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const gate = await requireWorkspace(req);
    if ("error" in gate) return gate.error;

    const { workspace_id } = gate;
    const supabase = getServerSupabase();
    const supabaseAdmin = createServiceClient();

    const body = await req.json();
    const { from_address, to_address, departure_time } = body;

    if (!from_address || !to_address) {
      return NextResponse.json(
        { error: "from_address and to_address are required" },
        { status: 400 }
      );
    }

    // Check cache first
    const { data: cached } = await supabaseAdmin
      .from("travel_cache")
      .select("travel_time_minutes, distance_miles, expires_at")
      .eq("workspace_id", workspace_id)
      .eq("from_address", from_address)
      .eq("to_address", to_address)
      .gt("expires_at", new Date().toISOString())
      .single();

    if (cached) {
      return NextResponse.json({
        travel_time_minutes: cached.travel_time_minutes,
        distance_miles: cached.distance_miles,
        cached: true,
      });
    }

    // Calculate travel time using mapping service
    // For now, use a simple estimation (1 mile = 2 minutes average)
    // In production, integrate with Google Maps API, Mapbox, or similar
    
    // TODO: Replace with actual mapping API call
    // Example: const result = await calculateTravelTime(from_address, to_address, departure_time);
    
    // For now, estimate based on simple distance calculation
    // This is a placeholder - should be replaced with real API
    const estimatedTravelTime = 15; // minutes (placeholder)
    const estimatedDistance = 7.5; // miles (placeholder)

    // Cache the result
    const { data: cachedResult, error: cacheError } = await supabaseAdmin.rpc(
      "calculate_and_cache_travel_time",
      {
        p_workspace_id: workspace_id,
        p_from_address: from_address,
        p_to_address: to_address,
        p_travel_time_minutes: estimatedTravelTime,
        p_distance_miles: estimatedDistance,
      }
    );

    if (cacheError) {
      console.error("Error caching travel time:", cacheError);
    }

    return NextResponse.json({
      travel_time_minutes: estimatedTravelTime,
      distance_miles: estimatedDistance,
      cached: false,
      note: "This is a placeholder calculation. Integrate with mapping API for accurate results.",
    });
  } catch (error: any) {
    console.error("Error in travelTime endpoint:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}





















































