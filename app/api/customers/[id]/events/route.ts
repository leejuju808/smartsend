// Block 254400 — SmartSend Lifetime Value Engine v1
// API Route: Customer Events
// GET /api/customers/[id]/events - Get customer events
// POST /api/customers/[id]/events - Create customer event

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get customer to verify access
    const { data: customer } = await supabase
      .from("customers")
      .select("team_id")
      .eq("id", params.id)
      .single();

    if (!customer) {
      return NextResponse.json(
        { error: "Customer not found" },
        { status: 404 }
      );
    }

    // Verify user is team member
    const { data: membership } = await supabase
      .from("team_members")
      .select("team_id")
      .eq("team_id", customer.team_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const event_type = searchParams.get("event_type");
    const limit = parseInt(searchParams.get("limit") || "50", 10);

    // Build query
    let query = supabase
      .from("customer_events")
      .select("*")
      .eq("customer_id", params.id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (status) {
      query = query.eq("status", status);
    }

    if (event_type) {
      query = query.eq("event_type", event_type);
    }

    const { data: events, error } = await query;

    if (error) {
      console.error("Error fetching events:", error);
      return NextResponse.json(
        { error: "Failed to fetch events" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      events: events || [],
    });
  } catch (error: any) {
    console.error("Error in events API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get customer to verify access
    const { data: customer } = await supabase
      .from("customers")
      .select("team_id")
      .eq("id", params.id)
      .single();

    if (!customer) {
      return NextResponse.json(
        { error: "Customer not found" },
        { status: 404 }
      );
    }

    // Verify user is team member
    const { data: membership } = await supabase
      .from("team_members")
      .select("team_id")
      .eq("team_id", customer.team_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const body = await req.json();
    const {
      event_type,
      title,
      description,
      details,
      priority,
      event_date,
      due_date,
      related_job_id,
      related_roofing_job_id,
    } = body;

    if (!event_type || !title) {
      return NextResponse.json(
        { error: "event_type and title are required" },
        { status: 400 }
      );
    }

    const { data: event, error } = await supabase
      .from("customer_events")
      .insert({
        customer_id: params.id,
        team_id: customer.team_id,
        event_type,
        title,
        description,
        details: details || {},
        priority: priority || "medium",
        event_date,
        due_date,
        related_job_id,
        related_roofing_job_id,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating event:", error);
      return NextResponse.json(
        { error: "Failed to create event" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      event,
    });
  } catch (error: any) {
    console.error("Error in events API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}






















