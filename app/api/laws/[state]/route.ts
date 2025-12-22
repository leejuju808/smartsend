import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/laws/{state}
 * 
 * Returns all state-specific laws and regulations for a given state.
 * Used by SmartSend to ensure compliance in messaging, insurance suggestions, and summaries.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { state: string } }
) {
  try {
    const supabase = await createClient();
    const stateCode = params.state?.toUpperCase();

    if (!stateCode || stateCode.length !== 2) {
      return NextResponse.json(
        { error: "Invalid state code. Must be 2 letters (e.g., 'WA', 'TX')" },
        { status: 400 }
      );
    }

    // Use the helper function to get all laws for the state
    const { data, error } = await supabase.rpc("get_state_laws", {
      p_state_code: stateCode,
    });

    if (error) {
      console.error("[State Laws API] Error fetching laws:", error);
      return NextResponse.json(
        { error: "Failed to fetch state laws", details: error.message },
        { status: 500 }
      );
    }

    // If no data found, return empty structure
    if (!data || Object.keys(data).length === 0) {
      return NextResponse.json({
        state_code: stateCode,
        message: "No state-specific laws found. Using default compliance rules.",
        rules: {
          licensing: {
            requires_license: false,
            license_type: null,
          },
          insurance: {
            can_negotiate_claim: false,
            can_document_damage: true,
            can_interpret_policy: false,
            can_show_damage: true,
          },
          storm: {
            door_to_door_allowed: true,
            same_day_solicitation: true,
          },
        },
        deductible: {
          waiving_illegal: false,
          assistance_allowed: true,
          financing_allowed: true,
        },
        matching: {
          requirement_type: "no_matching_rule",
        },
        code_requirements: {},
        restrictions: {
          prohibited_practices: {
            policy_interpretation: true,
            negotiation_language: true,
            false_storm_claims: true,
          },
        },
      });
    }

    return NextResponse.json({
      success: true,
      state_code: stateCode,
      laws: data,
      fetched_at: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("[State Laws API] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}





















































