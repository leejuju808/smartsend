// Block 256900 — Payroll & Timekeeping Engine v1
// GET /api/workforce/payroll/productivity
// POST /api/workforce/payroll/productivity/calculate
// Get and calculate labor productivity scores

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const company_id = searchParams.get("company_id");
    const job_id = searchParams.get("job_id");
    const crew_id = searchParams.get("crew_id");

    let query = supabase
      .from("labor_productivity_scores")
      .select(
        `
        *,
        job:jobs(id, address, homeowner_name),
        crew:crews(id, name)
      `
      )
      .order("period_start", { ascending: false });

    if (company_id) {
      query = query.eq("company_id", company_id);
    }

    if (job_id) {
      query = query.eq("job_id", job_id);
    }

    if (crew_id) {
      query = query.eq("crew_id", crew_id);
    }

    const { data: scores, error } = await query;

    if (error) {
      console.error("Error fetching productivity scores:", error);
      return NextResponse.json(
        { error: "Failed to fetch scores", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      scores: scores || [],
      count: scores?.length || 0,
    });
  } catch (error: any) {
    console.error("Error in productivity API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { job_id, period_start, period_end } = body;

    if (!job_id || !period_start || !period_end) {
      return NextResponse.json(
        {
          error: "job_id, period_start, and period_end are required",
        },
        { status: 400 }
      );
    }

    // Calculate productivity score
    const { data, error } = await supabase.rpc("calculate_labor_productivity", {
      p_job_id: job_id,
      p_period_start: period_start,
      p_period_end: period_end,
    });

    if (error) {
      console.error("Productivity calculation error:", error);
      return NextResponse.json(
        { error: "Calculation failed", details: error.message },
        { status: 500 }
      );
    }

    // Get updated score
    const { data: score, error: scoreError } = await supabase
      .from("labor_productivity_scores")
      .select("*")
      .eq("job_id", job_id)
      .eq("period_start", period_start)
      .eq("period_end", period_end)
      .single();

    return NextResponse.json({
      success: true,
      message: "Productivity score calculated successfully",
      score: score,
    });
  } catch (error: any) {
    console.error("Error in productivity calculation API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





















