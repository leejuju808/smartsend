import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { requireWorkspace } from "@/lib/workspace/withWorkspace";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * POST /api/scheduler/suggest
 * Get AI-recommended time suggestions for a homeowner
 * Body:
 * {
 *   property_address: string (required)
 *   appointment_type?: string
 *   contact_id?: uuid
 *   preferred_date?: YYYY-MM-DD
 *   max_suggestions?: number (default: 3)
 *   context?: string - e.g., "What time works?", "Can you come tomorrow?", "Any openings this week?"
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
    const {
      property_address,
      appointment_type,
      contact_id,
      preferred_date,
      max_suggestions = 3,
      context,
    } = body;

    if (!property_address) {
      return NextResponse.json(
        { error: "property_address is required" },
        { status: 400 }
      );
    }

    // Get contact info for lead priority
    let leadPriority: string | null = null;
    let leadStatus: string | null = null;
    if (contact_id) {
      const { data: contact } = await supabase
        .from("contacts")
        .select("lead_status, tags, insurance_tagged")
        .eq("id", contact_id)
        .single();

      if (contact) {
        leadStatus = contact.lead_status;
        // Determine priority
        if (contact.insurance_tagged) {
          leadPriority = "insurance";
        } else if (contact.tags && Array.isArray(contact.tags) && contact.tags.includes("storm_damage")) {
          leadPriority = "storm";
        } else if (contact.lead_status === "hot") {
          leadPriority = "hot";
        } else if (contact.lead_status === "warm") {
          leadPriority = "warm";
        } else {
          leadPriority = "cold";
        }
      }
    }

    // Determine target date based on context
    let targetDate: string;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (context) {
      const lowerContext = context.toLowerCase();
      if (lowerContext.includes("tomorrow")) {
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        targetDate = tomorrow.toISOString().split("T")[0];
      } else if (lowerContext.includes("today") || lowerContext.includes("same day")) {
        targetDate = today.toISOString().split("T")[0];
      } else if (lowerContext.includes("week")) {
        // Next 7 days
        const nextWeek = new Date(today);
        nextWeek.setDate(nextWeek.getDate() + 7);
        targetDate = nextWeek.toISOString().split("T")[0];
      } else {
        targetDate = preferred_date || today.toISOString().split("T")[0];
      }
    } else {
      targetDate = preferred_date || today.toISOString().split("T")[0];
    }

    // Get scheduler settings
    const { data: settings } = await supabase
      .from("scheduler_settings")
      .select("*")
      .eq("workspace_id", workspace_id)
      .single();

    // Check same-day booking restrictions
    if (targetDate === today.toISOString().split("T")[0]) {
      if (!settings?.allow_same_day_booking) {
        // Get earliest safe time tomorrow
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const { data: tomorrowSlots } = await supabase.rpc("get_smart_available_slots", {
          p_workspace_id: workspace_id,
          p_date: tomorrow.toISOString().split("T")[0],
          p_duration: 30,
          p_property_address: property_address,
          p_appointment_type: appointment_type || null,
          p_contact_id: contact_id || null,
        });

        if (tomorrowSlots && tomorrowSlots.length > 0) {
          const earliestSlot = tomorrowSlots.find((s: any) => s.available);
          if (earliestSlot) {
            return NextResponse.json({
              suggestions: [
                {
                  start_time: earliestSlot.start_time,
                  end_time: earliestSlot.end_time,
                  quality_score: earliestSlot.quality_score,
                  quality_category: earliestSlot.quality_category,
                  travel_time_from_previous: earliestSlot.travel_time_from_previous,
                  message: `No openings today — earliest safe time is ${new Date(earliestSlot.start_time).toLocaleString()}`,
                  date: tomorrow.toISOString().split("T")[0],
                },
              ],
              same_day_blocked: true,
              reason: "Same-day booking not available",
            });
          }
        }
      }
    }

    // Get priority slots
    const { data: prioritySlots, error: priorityError } = await supabase.rpc(
      "get_priority_slots",
      {
        p_workspace_id: workspace_id,
        p_date: targetDate,
        p_duration: 30,
        p_property_address: property_address,
        p_appointment_type: appointment_type || null,
        p_contact_id: contact_id || null,
        p_lead_priority: leadPriority || null,
      }
    );

    if (priorityError) {
      console.error("Error fetching priority slots:", priorityError);
      // Fallback to regular slots
      const { data: regularSlots } = await supabase.rpc("get_smart_available_slots", {
        p_workspace_id: workspace_id,
        p_date: targetDate,
        p_duration: 30,
        p_property_address: property_address,
        p_appointment_type: appointment_type || null,
        p_contact_id: contact_id || null,
      });

      const suggestions = (regularSlots || [])
        .filter((s: any) => s.available)
        .slice(0, max_suggestions)
        .map((slot: any, index: number) => ({
          start_time: slot.start_time,
          end_time: slot.end_time,
          quality_score: slot.quality_score,
          quality_category: slot.quality_category,
          travel_time_from_previous: slot.travel_time_from_previous,
          message: formatSuggestionMessage(slot, index),
        }));

      return NextResponse.json({
        suggestions,
        date: targetDate,
      });
    }

    // Format suggestions with friendly messages
    const suggestions = (prioritySlots || [])
      .slice(0, max_suggestions)
      .map((slot: any, index: number) => ({
        start_time: slot.start_time,
        end_time: slot.end_time,
        quality_score: slot.quality_score,
        quality_category: slot.quality_category,
        travel_time_from_previous: slot.travel_time_from_previous,
        message: formatSuggestionMessage(slot, index),
        priority_rank: slot.priority_rank,
      }));

    return NextResponse.json({
      suggestions,
      date: targetDate,
      lead_priority: leadPriority,
    });
  } catch (error: any) {
    console.error("Error in suggest endpoint:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

function formatSuggestionMessage(slot: any, index: number): string {
  const date = new Date(slot.start_time);
  const timeStr = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  const dateStr = date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  let message = `Available ${dateStr} at ${timeStr}`;

  if (slot.travel_time_from_previous) {
    message += ` — ${slot.travel_time_from_previous} minutes from previous job`;
  }

  if (slot.quality_category === "optimal") {
    message += " (optimal time)";
  } else if (slot.quality_category === "risky") {
    message += " (may have constraints)";
  }

  return message;
}





















































