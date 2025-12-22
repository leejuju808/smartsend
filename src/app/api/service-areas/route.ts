// Block 72000 — Service Area Mapping API
// GET: List all service areas for workspace
// POST: Create a new service area

import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { requireWorkspace } from "@/lib/workspace/withWorkspace";

export async function GET(req: NextRequest) {
  try {
    const gate = await requireWorkspace(req);
    if ("error" in gate) return gate.error;

    const { workspace_id } = gate;
    const supabase = getServerSupabase();

    const { data: areas, error } = await supabase
      .from("service_areas")
      .select("*")
      .eq("workspace_id", workspace_id)
      .order("is_primary", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching service areas:", error);
      return NextResponse.json(
        { error: "Failed to fetch service areas" },
        { status: 500 }
      );
    }

    return NextResponse.json({ areas: areas || [] });
  } catch (error) {
    console.error("Error in GET /api/service-areas:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const gate = await requireWorkspace(req);
    if ("error" in gate) return gate.error;

    const { workspace_id } = gate;
    const supabase = getServerSupabase();

    const body = await req.json();
    const { name, center_lat, center_lng, radius_miles, is_primary } = body;

    // Validation
    if (!name || !center_lat || !center_lng || !radius_miles) {
      return NextResponse.json(
        { error: "Missing required fields: name, center_lat, center_lng, radius_miles" },
        { status: 400 }
      );
    }

    if (radius_miles < 1 || radius_miles > 100) {
      return NextResponse.json(
        { error: "Radius must be between 1 and 100 miles" },
        { status: 400 }
      );
    }

    // If this is marked as primary, unset other primary areas
    if (is_primary) {
      await supabase
        .from("service_areas")
        .update({ is_primary: false })
        .eq("workspace_id", workspace_id)
        .eq("is_primary", true);
    }

    const { data: area, error } = await supabase
      .from("service_areas")
      .insert({
        workspace_id,
        name,
        center_lat,
        center_lng,
        radius_miles,
        is_primary: is_primary || false,
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating service area:", error);
      return NextResponse.json(
        { error: "Failed to create service area" },
        { status: 500 }
      );
    }

    return NextResponse.json({ area }, { status: 201 });
  } catch (error) {
    console.error("Error in POST /api/service-areas:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}



























