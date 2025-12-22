import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { requireWorkspace } from "@/lib/workspace/withWorkspace";

/**
 * POST /api/scheduler/prioritySort
 * Sort available slots by priority based on lead type
 * Body:
 * {
 *   date: YYYY-MM-DD (required)
 *   property_address: string (required)
 *   appointment_type?: string
 *   contact_id?: uuid
 *   lead_priority?: 'insurance' | 'storm' | 'hot' | 'warm' | 'cold'
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const gate = await requireWorkspace(req);
    if ("error" in gate) return gate.error;

    const { workspace_id } = gate;
    const supabase = getServerSupabase();

    const body = await req.json();
    const { date, property_address, appointment_type, contact_id, lead_priority } = body;

    if (!date || !property_address) {
      return NextResponse.json(
        { error: "date and property_address are required" },
        { status: 400 }
      );
    }

    // Get priority slots
    const { data: prioritySlots, error } = await supabase.rpc("get_priority_slots", {
      p_workspace_id: workspace_id,
      p_date: date,
      p_duration: 30,
      p_property_address: property_address,
      p_appointment_type: appointment_type || null,
      p_contact_id: contact_id || null,
      p_lead_priority: lead_priority || null,
    });

    if (error) {
      console.error("Error fetching priority slots:", error);
      return NextResponse.json(
        { error: "Failed to fetch priority slots", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      date,
      lead_priority: lead_priority || "standard",
      slots: (prioritySlots || []).map((slot: any) => ({
        start_time: slot.start_time,
        end_time: slot.end_time,
        priority_rank: slot.priority_rank,
        quality_score: slot.quality_score,
        reason: slot.reason,
      })),
      total: prioritySlots?.length || 0,
    });
  } catch (error: any) {
    console.error("Error in prioritySort endpoint:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}





















































