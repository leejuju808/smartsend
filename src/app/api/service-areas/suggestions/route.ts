// Block 72000 — Service Area Suggestions API
// GET: Get smart expansion suggestions
// POST: Generate new suggestions

import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { requireWorkspace } from "@/lib/workspace/withWorkspace";

export async function GET(req: NextRequest) {
  try {
    const gate = await requireWorkspace(req);
    if ("error" in gate) return gate.error;

    const { workspace_id } = gate;
    const supabase = getServerSupabase();

    const url = new URL(req.url);
    const status = url.searchParams.get("status") || "pending";

    const { data: suggestions, error } = await supabase
      .from("service_area_suggestions")
      .select("*")
      .eq("workspace_id", workspace_id)
      .eq("status", status)
      .order("generated_at", { ascending: false });

    if (error) {
      console.error("Error fetching suggestions:", error);
      return NextResponse.json(
        { error: "Failed to fetch suggestions" },
        { status: 500 }
      );
    }

    return NextResponse.json({ suggestions: suggestions || [] });
  } catch (error) {
    console.error("Error in GET /api/service-areas/suggestions:", error);
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

    // Generate suggestions using the database function
    const { error: generateError } = await supabase.rpc(
      "generate_service_area_suggestions",
      { p_workspace_id: workspace_id }
    );

    if (generateError) {
      console.error("Error generating suggestions:", generateError);
      return NextResponse.json(
        { error: "Failed to generate suggestions" },
        { status: 500 }
      );
    }

    // Fetch the newly generated suggestions
    const { data: suggestions, error: fetchError } = await supabase
      .from("service_area_suggestions")
      .select("*")
      .eq("workspace_id", workspace_id)
      .eq("status", "pending")
      .order("generated_at", { ascending: false });

    if (fetchError) {
      console.error("Error fetching new suggestions:", fetchError);
      return NextResponse.json(
        { error: "Failed to fetch new suggestions" },
        { status: 500 }
      );
    }

    return NextResponse.json({ suggestions: suggestions || [] });
  } catch (error) {
    console.error("Error in POST /api/service-areas/suggestions:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}



























