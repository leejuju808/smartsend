// Block 30041 — SmartSend Roofing "Storm Event Lead Surge Engine" v1
// API Route: Get Storm Leads
// GET /api/storms/leads?workspace_id=xxx&storm_event_id=xxx

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
    const storm_event_id = searchParams.get("storm_event_id");
    const classification = searchParams.get("classification");
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
      .from("storm_leads")
      .select(`
        *,
        lead:leads (
          id,
          email,
          first_name,
          last_name,
          phone,
          zip_code,
          score,
          status,
          created_at
        ),
        storm_event:storm_events (
          id,
          zip_code,
          event_type,
          severity,
          detected_at,
          metadata
        )
      `)
      .eq("workspace_id", workspace_id)
      .order("urgency_score", { ascending: false })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (storm_event_id) {
      query = query.eq("storm_event_id", storm_event_id);
    }

    if (classification) {
      query = query.eq("classification", classification);
    }

    const { data: stormLeads, error: leadsError } = await query;

    if (leadsError) {
      console.error("Error getting storm leads:", leadsError);
      return NextResponse.json(
        { error: "Failed to get storm leads" },
        { status: 500 }
      );
    }

    return NextResponse.json({ storm_leads: stormLeads || [] });
  } catch (error) {
    console.error("Error in storms leads API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}


































