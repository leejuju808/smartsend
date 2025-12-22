// Block 226000 — SmartSend Roofing Safety Compliance System
// GET /api/safety/toolbox/talks
// Get toolbox talks for a date or date range

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date");
    const workspaceId = searchParams.get("workspaceId");
    const companyId = searchParams.get("companyId");

    let query = supabase
      .from("toolbox_talks")
      .select("*")
      .order("date", { ascending: false });

    if (date) {
      query = query.eq("date", date);
    }

    if (workspaceId) {
      query = query.eq("workspace_id", workspaceId);
    }

    if (companyId) {
      query = query.eq("company_id", companyId);
    }

    const { data: talks, error } = await query;

    if (error) {
      console.error("Error fetching toolbox talks:", error);
      return NextResponse.json(
        { error: "Failed to fetch toolbox talks", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      talks: talks || [],
    });
  } catch (error: any) {
    console.error("Get toolbox talks error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























