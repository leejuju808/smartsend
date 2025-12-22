// Block 28412 — SmartSend Roofing Past Customer Reactivation Engine v1
// API Route: List Reactivation Events
// GET /api/reactivation/events?workspace_id=xxx&status=scheduled|sent|replied|booked

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
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

    const { searchParams } = new URL(req.url);
    const workspace_id = searchParams.get("workspace_id");
    const status = searchParams.get("status");
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");

    if (!workspace_id) {
      return NextResponse.json(
        { error: "workspace_id required" },
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

    // Build query
    let query = supabase
      .from("reactivation_events")
      .select(`
        *,
        past_customers:past_customer_id (
          id,
          homeowner_name,
          email,
          phone,
          job_completed_at,
          roof_type,
          job_value
        )
      `)
      .eq("workspace_id", workspace_id)
      .order("scheduled_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq("status", status);
    }

    const { data: events, error: eventsError } = await query;

    if (eventsError) {
      console.error("Error getting reactivation events:", eventsError);
      return NextResponse.json(
        { error: "Failed to get reactivation events" },
        { status: 500 }
      );
    }

    return NextResponse.json({ events: events || [] });
  } catch (error) {
    console.error("Error in reactivation events API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}


































