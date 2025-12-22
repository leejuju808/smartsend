import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { requireWorkspace } from "@/lib/workspace/withWorkspace";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * POST /api/scheduler/ai-recommendations
 * Get AI-recommended time slots based on homeowner request
 * Body:
 * {
 *   homeowner_address: string (required)
 *   preferred_date?: string (YYYY-MM-DD)
 *   preferred_time?: string ("morning", "afternoon", "evening")
 *   urgency?: "low" | "medium" | "high" | "urgent"
 *   storm_related?: boolean
 *   insurance_claim?: boolean
 *   max_suggestions?: number (default: 3)
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
      homeowner_address,
      preferred_date,
      preferred_time,
      urgency = "medium",
      storm_related = false,
      insurance_claim = false,
      max_suggestions = 3,
    } = body;

    if (!homeowner_address) {
      return NextResponse.json(
        { error: "homeowner_address is required" },
        { status: 400 }
      );
    }

    // Get scheduler settings
    const { data: settings } = await supabase
      .from("scheduler_settings")
      .select("*")
      .eq("workspace_id", workspace_id)
      .single();

    const defaultDuration = settings?.default_slot_duration || 15;
    const considerTravelTime = settings?.consider_travel_time ?? true;
    const considerStormUrgency = settings?.consider_storm_urgency ?? true;

    // Determine date range to check
    const startDate = preferred_date
      ? new Date(preferred_date)
      : new Date(); // Start from today
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 7); // Check next 7 days

    // Get roofer's base address (from workspace or settings)
    // For now, we'll use a placeholder - this should come from workspace settings
    const rooferBaseAddress = "123 Main St"; // TODO: Get from workspace settings

    // Collect available slots from next 7 days
    const allSlots: Array<{
      start_time: string;
      end_time: string;
      weather_safe: boolean;
      date: string;
      travel_time?: number;
      score: number;
    }> = [];

    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split("T")[0];

      const { data: slots } = await supabaseAdmin.rpc("get_weather_aware_time_slots", {
        p_workspace_id: workspace_id,
        p_date: dateStr,
        p_duration: defaultDuration,
        p_location_address: homeowner_address,
        p_location_zip: null,
      });

      if (slots) {
        for (const slot of slots) {
          if (!slot.weather_safe) continue;

          let score = 50; // Base score

          // Prefer preferred date
          if (preferred_date && dateStr === preferred_date) {
            score += 30;
          }

          // Prefer preferred time of day
          const hour = new Date(slot.start_time).getHours();
          if (preferred_time === "morning" && hour >= 8 && hour < 12) {
            score += 20;
          } else if (preferred_time === "afternoon" && hour >= 12 && hour < 17) {
            score += 20;
          } else if (preferred_time === "evening" && hour >= 17 && hour < 19) {
            score += 20;
          }

          // Boost score for storm-related/urgent leads (earlier appointments)
          if (storm_related || urgency === "urgent" || urgency === "high") {
            const daysUntil = Math.floor(
              (new Date(slot.start_time).getTime() - new Date().getTime()) /
                (1000 * 60 * 60 * 24)
            );
            if (daysUntil <= 1) score += 40;
            else if (daysUntil <= 2) score += 20;
          }

          // Boost score for insurance claims (high value)
          if (insurance_claim) {
            score += 15;
          }

          // Calculate travel time if enabled (placeholder - should use actual API)
          let travelTime = null;
          if (considerTravelTime) {
            // Check cache first
            const { data: cached } = await supabase
              .from("travel_cache")
              .select("travel_time_minutes")
              .eq("workspace_id", workspace_id)
              .eq("from_address", rooferBaseAddress)
              .eq("to_address", homeowner_address)
              .gt("expires_at", new Date().toISOString())
              .single();

            if (cached) {
              travelTime = cached.travel_time_minutes;
            } else {
              // Placeholder: estimate 15 minutes (should use Google Maps API)
              travelTime = 15;
              // TODO: Call Google Maps Distance Matrix API and cache result
            }

            // Prefer slots with shorter travel times
            if (travelTime < 10) score += 10;
            else if (travelTime < 20) score += 5;
          }

          allSlots.push({
            start_time: slot.start_time,
            end_time: slot.end_time,
            weather_safe: slot.weather_safe,
            date: dateStr,
            travel_time: travelTime || undefined,
            score,
          });
        }
      }
    }

    // Sort by score (highest first) and take top suggestions
    const recommendations = allSlots
      .sort((a, b) => b.score - a.score)
      .slice(0, max_suggestions)
      .map((slot) => ({
        start_time: slot.start_time,
        end_time: slot.end_time,
        date: slot.date,
        travel_time_minutes: slot.travel_time,
        reason: generateRecommendationReason(slot, preferred_time, storm_related, urgency),
      }));

    return NextResponse.json({
      recommendations,
      count: recommendations.length,
    });
  } catch (error: any) {
    console.error("Error in ai-recommendations endpoint:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

function generateRecommendationReason(
  slot: any,
  preferredTime?: string,
  stormRelated?: boolean,
  urgency?: string
): string {
  const reasons: string[] = [];

  if (stormRelated || urgency === "urgent") {
    reasons.push("Early appointment for urgent storm damage");
  }

  if (preferredTime) {
    reasons.push(`Matches your ${preferredTime} preference`);
  }

  if (slot.travel_time && slot.travel_time < 10) {
    reasons.push("Close to your location");
  }

  reasons.push("Weather-safe time slot");

  return reasons.join(" • ");
}





















































