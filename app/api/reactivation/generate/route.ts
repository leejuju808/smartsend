// Block 28412 — SmartSend Roofing Past Customer Reactivation Engine v1
// API Route: Generate Reactivation Events
// POST /api/reactivation/generate

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();

    // Ensure user is authenticated
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { workspace_id } = body;

    if (!workspace_id) {
      return NextResponse.json(
        { error: "workspace_id is required" },
        { status: 400 }
      );
    }

    // Verify user has access to this workspace
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    // Call edge function to generate events
    const { data: generateResult, error: generateError } = await supabase.functions.invoke(
      "schedule-reactivation",
      {
        body: {},
      },
      {
        headers: {
          "workspace_id": workspace_id,
        },
      }
    );

    // Alternative: Call database function directly
    const { data: dbResult, error: dbError } = await supabase.rpc(
      "generate_reactivation_events",
      { p_workspace_id: workspace_id }
    );

    if (dbError) {
      console.error("Error generating reactivation events:", dbError);
      return NextResponse.json(
        { error: "Failed to generate reactivation events" },
        { status: 500 }
      );
    }

    const result = Array.isArray(dbResult) && dbResult.length > 0 ? dbResult[0] : {
      events_created: 0,
      customers_processed: 0,
    };

    return NextResponse.json({
      ok: true,
      events_created: Number(result.events_created || 0),
      customers_processed: Number(result.customers_processed || 0),
      message: `Generated ${result.events_created || 0} reactivation events from ${result.customers_processed || 0} customers`,
    });
  } catch (error) {
    console.error("Error in reactivation generate API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}


































