import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { requireWorkspace } from "@/lib/workspace/withWorkspace";

/**
 * POST /api/scheduler/slotOptimizer
 * Optimize slot selection based on multiple factors
 * Body:
 * {
 *   date: YYYY-MM-DD (required)
 *   property_address: string (required)
 *   appointment_type?: string
 *   contact_id?: uuid
 *   optimization_goals?: string[] - e.g., ['minimize_travel', 'maximize_quality', 'earliest_available']
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const gate = await requireWorkspace(req);
    if ("error" in gate) return gate.error;

    const { workspace_id } = gate;
    const supabase = getServerSupabase();

    const body = await req.json();
    const {
      date,
      property_address,
      appointment_type,
      contact_id,
      optimization_goals = ["maximize_quality"],
    } = body;

    if (!date || !property_address) {
      return NextResponse.json(
        { error: "date and property_address are required" },
        { status: 400 }
      );
    }

    // Get smart available slots
    const { data: slots, error } = await supabase.rpc("get_smart_available_slots", {
      p_workspace_id: workspace_id,
      p_date: date,
      p_duration: 30,
      p_property_address: property_address,
      p_appointment_type: appointment_type || null,
      p_contact_id: contact_id || null,
    });

    if (error) {
      console.error("Error fetching slots:", error);
      return NextResponse.json(
        { error: "Failed to fetch slots", details: error.message },
        { status: 500 }
      );
    }

    const availableSlots = (slots || []).filter((s: any) => s.available);

    if (availableSlots.length === 0) {
      return NextResponse.json({
        optimized_slot: null,
        alternatives: [],
        message: "No available slots found",
      });
    }

    // Optimize based on goals
    let optimizedSlot: any = null;
    let sortedSlots = [...availableSlots];

    if (optimization_goals.includes("minimize_travel")) {
      // Sort by travel time (ascending)
      sortedSlots.sort((a, b) => {
        const aTravel = a.travel_time_from_previous || 999;
        const bTravel = b.travel_time_from_previous || 999;
        return aTravel - bTravel;
      });
    } else if (optimization_goals.includes("maximize_quality")) {
      // Sort by quality score (descending)
      sortedSlots.sort((a, b) => {
        const aScore = a.quality_score || 0;
        const bScore = b.quality_score || 0;
        return bScore - aScore;
      });
    } else if (optimization_goals.includes("earliest_available")) {
      // Sort by start time (ascending)
      sortedSlots.sort((a, b) => {
        return new Date(a.start_time).getTime() - new Date(b.start_time).getTime();
      });
    } else {
      // Default: maximize quality
      sortedSlots.sort((a, b) => {
        const aScore = a.quality_score || 0;
        const bScore = b.quality_score || 0;
        return bScore - aScore;
      });
    }

    optimizedSlot = sortedSlots[0];
    const alternatives = sortedSlots.slice(1, 4); // Top 3 alternatives

    return NextResponse.json({
      optimized_slot: {
        start_time: optimizedSlot.start_time,
        end_time: optimizedSlot.end_time,
        quality_score: optimizedSlot.quality_score,
        quality_category: optimizedSlot.quality_category,
        travel_time_from_previous: optimizedSlot.travel_time_from_previous,
        travel_time_from_office: optimizedSlot.travel_time_from_office,
        weather_safe: optimizedSlot.weather_safe,
        daylight_safe: optimizedSlot.daylight_safe,
        reason: optimizedSlot.reason,
      },
      alternatives: alternatives.map((slot: any) => ({
        start_time: slot.start_time,
        end_time: slot.end_time,
        quality_score: slot.quality_score,
        quality_category: slot.quality_category,
        travel_time_from_previous: slot.travel_time_from_previous,
      })),
      optimization_goals,
      total_available: availableSlots.length,
    });
  } catch (error: any) {
    console.error("Error in slotOptimizer endpoint:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}





















































