// Block 72000 — Service Area Suggestion Actions
// PATCH: Update suggestion status (accept, dismiss)

import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { requireWorkspace } from "@/lib/workspace/withWorkspace";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const gate = await requireWorkspace(req);
    if ("error" in gate) return gate.error;

    const { workspace_id } = gate;
    const supabase = getServerSupabase();

    const body = await req.json();
    const { status } = body;

    if (!status || !["accepted", "dismissed", "implemented"].includes(status)) {
      return NextResponse.json(
        { error: "Invalid status. Must be: accepted, dismissed, or implemented" },
        { status: 400 }
      );
    }

    const { data: suggestion, error } = await supabase
      .from("service_area_suggestions")
      .update({ status })
      .eq("id", params.id)
      .eq("workspace_id", workspace_id)
      .select()
      .single();

    if (error) {
      console.error("Error updating suggestion:", error);
      return NextResponse.json(
        { error: "Failed to update suggestion" },
        { status: 500 }
      );
    }

    // If accepted, optionally create the service area automatically
    if (status === "accepted" && suggestion) {
      const { error: createError } = await supabase
        .from("service_areas")
        .insert({
          workspace_id,
          name: `Expansion: ${suggestion.zipcode}`,
          center_lat: suggestion.suggested_center_lat,
          center_lng: suggestion.suggested_center_lng,
          radius_miles: suggestion.suggested_radius_miles || 5,
          is_active: true,
        });

      if (createError) {
        console.error("Error creating service area from suggestion:", createError);
        // Don't fail the request, just log the error
      } else {
        // Mark as implemented
        await supabase
          .from("service_area_suggestions")
          .update({ status: "implemented" })
          .eq("id", params.id);
      }
    }

    return NextResponse.json({ suggestion });
  } catch (error) {
    console.error("Error in PATCH /api/service-areas/suggestions/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}



























