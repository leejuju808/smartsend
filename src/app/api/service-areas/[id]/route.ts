// Block 72000 — Service Area Mapping API
// GET: Get single service area
// PATCH: Update service area
// DELETE: Delete service area

import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { requireWorkspace } from "@/lib/workspace/withWorkspace";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const gate = await requireWorkspace(req);
    if ("error" in gate) return gate.error;

    const { workspace_id } = gate;
    const supabase = getServerSupabase();

    const { data: area, error } = await supabase
      .from("service_areas")
      .select("*")
      .eq("id", params.id)
      .eq("workspace_id", workspace_id)
      .single();

    if (error || !area) {
      return NextResponse.json(
        { error: "Service area not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ area });
  } catch (error) {
    console.error("Error in GET /api/service-areas/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

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
    const { name, center_lat, center_lng, radius_miles, is_primary, is_active } = body;

    // Validate radius if provided
    if (radius_miles !== undefined && (radius_miles < 1 || radius_miles > 100)) {
      return NextResponse.json(
        { error: "Radius must be between 1 and 100 miles" },
        { status: 400 }
      );
    }

    // If setting as primary, unset other primary areas
    if (is_primary) {
      await supabase
        .from("service_areas")
        .update({ is_primary: false })
        .eq("workspace_id", workspace_id)
        .eq("is_primary", true)
        .neq("id", params.id);
    }

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (center_lat !== undefined) updateData.center_lat = center_lat;
    if (center_lng !== undefined) updateData.center_lng = center_lng;
    if (radius_miles !== undefined) updateData.radius_miles = radius_miles;
    if (is_primary !== undefined) updateData.is_primary = is_primary;
    if (is_active !== undefined) updateData.is_active = is_active;

    const { data: area, error } = await supabase
      .from("service_areas")
      .update(updateData)
      .eq("id", params.id)
      .eq("workspace_id", workspace_id)
      .select()
      .single();

    if (error) {
      console.error("Error updating service area:", error);
      return NextResponse.json(
        { error: "Failed to update service area" },
        { status: 500 }
      );
    }

    return NextResponse.json({ area });
  } catch (error) {
    console.error("Error in PATCH /api/service-areas/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const gate = await requireWorkspace(req);
    if ("error" in gate) return gate.error;

    const { workspace_id } = gate;
    const supabase = getServerSupabase();

    const { error } = await supabase
      .from("service_areas")
      .delete()
      .eq("id", params.id)
      .eq("workspace_id", workspace_id);

    if (error) {
      console.error("Error deleting service area:", error);
      return NextResponse.json(
        { error: "Failed to delete service area" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in DELETE /api/service-areas/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}



























