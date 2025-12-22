// Block 18400 — Smart Time Suggestions API
// GET /api/calendar/suggestions — Get smart time suggestions based on natural language query

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Get workspace ID
    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 404 }
      );
    }

    // Get query parameters
    const searchParams = req.nextUrl.searchParams;
    const query = searchParams.get("query"); // e.g., "tomorrow", "Wednesday", "next week"
    const durationParam = searchParams.get("duration");
    const propertyAddress = searchParams.get("property_address");
    const appointmentType = searchParams.get("appointment_type");
    const userId = searchParams.get("user_id");
    const maxSuggestionsParam = searchParams.get("max_suggestions");

    // Validate required parameters
    if (!query) {
      return NextResponse.json(
        { error: "query parameter is required (e.g., 'tomorrow', 'Wednesday', 'next week')" },
        { status: 400 }
      );
    }

    const duration = durationParam ? parseInt(durationParam, 10) : 30;
    if (isNaN(duration) || duration < 15 || duration > 180) {
      return NextResponse.json(
        { error: "Duration must be between 15 and 180 minutes" },
        { status: 400 }
      );
    }

    const maxSuggestions = maxSuggestionsParam ? parseInt(maxSuggestionsParam, 10) : 3;
    if (isNaN(maxSuggestions) || maxSuggestions < 1 || maxSuggestions > 10) {
      return NextResponse.json(
        { error: "max_suggestions must be between 1 and 10" },
        { status: 400 }
      );
    }

    // Call database function to get smart suggestions
    const { data: suggestions, error: suggestionsError } = await supabase.rpc(
      "get_smart_time_suggestions",
      {
        p_workspace_id: workspaceId,
        p_query_text: query,
        p_duration: duration,
        p_property_address: propertyAddress || null,
        p_appointment_type: appointmentType || null,
        p_user_id: userId || null,
        p_max_suggestions: maxSuggestions,
      }
    );

    if (suggestionsError) {
      console.error("[Calendar Suggestions] Database error:", suggestionsError);
      return NextResponse.json(
        { error: "Failed to get suggestions", details: suggestionsError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      query,
      duration,
      suggestions: (suggestions || []).map((suggestion: any) => ({
        start_time: suggestion.start_time,
        end_time: suggestion.end_time,
        suggestion_reason: suggestion.suggestion_reason,
        quality_score: suggestion.quality_score,
        travel_time_minutes: suggestion.travel_time_minutes,
      })),
    });
  } catch (error: any) {
    console.error("[Calendar Suggestions] Error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





















































