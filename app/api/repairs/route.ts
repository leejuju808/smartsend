// Block 255500 — SmartSend Repair Division Engine v1
// GET /api/repairs
// List repair requests with filtering

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const team_id = searchParams.get("team_id");
    const status = searchParams.get("status");
    const urgency = searchParams.get("urgency");
    const tech_id = searchParams.get("tech_id");
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");

    if (!team_id) {
      return NextResponse.json(
        { error: "team_id is required" },
        { status: 400 }
      );
    }

    let query = supabase
      .from("repair_requests")
      .select(
        `
        *,
        customers(id, name, email, phone),
        repair_jobs(id, status, scheduled_time, price, tech_id, completed_at)
      `,
        { count: "exact" }
      )
      .eq("team_id", team_id);

    if (status) {
      query = query.eq("status", status);
    }

    if (urgency) {
      query = query.eq("urgency", urgency);
    }

    if (tech_id) {
      query = query.eq("assigned_tech_id", tech_id);
    }

    query = query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    const { data: repairRequests, error: requestsError, count } = await query;

    if (requestsError) {
      return NextResponse.json(
        { error: "Failed to fetch repair requests", details: requestsError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      repair_requests: repairRequests || [],
      count: count || 0,
      limit,
      offset,
    });
  } catch (error: any) {
    console.error("Error in list repair requests API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





















